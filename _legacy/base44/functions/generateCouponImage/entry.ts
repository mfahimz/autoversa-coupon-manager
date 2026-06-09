import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const CONVERTAPI_SECRET = Deno.env.get('CONVERTAPI_SECRET');

// Debug log
console.log('CONVERTAPI_SECRET configured:', !!CONVERTAPI_SECRET);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { template_id, couponData } = await req.json();

        const template = await base44.asServiceRole.entities.Template.get(template_id);
        const positions = await base44.asServiceRole.entities.TemplateVariablePosition.filter({ 
            template_id: template_id 
        });

        console.log('Template:', template.name, 'ID:', template_id);
        console.log('Positions found:', positions.length);
        console.log('Coupon data received:', JSON.stringify(couponData));

        const variableMap = {
            'CUSTOMER_NAME': couponData.customer_name,
            'MOBILE_NUMBER': couponData.mobile_number,
            'PLATE_COMBINED_STRING': couponData.plate_combined_string,
            'OFFER_TITLE': couponData.offer_title,
            'BRANCH_NAME': couponData.branch_name,
            'ISSUE_DATE': couponData.issue_date,
            'EXPIRY_DATE': couponData.expiry_date,
            'COUPON_ID': couponData.coupon_code,
        };

        // Fetch template image and convert to base64
        console.log('Fetching template image from:', template.file_url);
        console.log('Template dimensions:', template.image_width, 'x', template.image_height);
        
        const imageResponse = await fetch(template.file_url);
        if (!imageResponse.ok) {
            throw new Error(`Failed to fetch template image: ${imageResponse.status}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        console.log('Image buffer size:', imageBuffer.byteLength);
        
        const uint8Array = new Uint8Array(imageBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const imageBase64 = btoa(binary);
        const imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
        console.log('Image mime type:', imageMimeType);
        console.log('Base64 length:', imageBase64.length);

        // Build text overlays - deduplicate positions by variable_key (keep first one)
        const seenKeys = new Set();
        const uniquePositions = positions.filter(pos => {
            if (seenKeys.has(pos.variable_key)) return false;
            seenKeys.add(pos.variable_key);
            return true;
        });

        console.log('Unique positions:', uniquePositions.length);

        let svgTexts = '';
        for (const pos of uniquePositions) {
            console.log('Processing position:', pos.variable_key, 'x:', pos.x_coordinate, 'y:', pos.y_coordinate);
            const textValue = variableMap[pos.variable_key];
            console.log('Text value for', pos.variable_key, ':', textValue);
            if (textValue && pos.x_coordinate && pos.y_coordinate) {
                const fontSize = pos.font_size || 16;
                const escapedText = String(textValue)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
                svgTexts += `<text x="${pos.x_coordinate}" y="${pos.y_coordinate + fontSize}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="bold" fill="#000000">${escapedText}</text>\n`;
                console.log('Added text:', escapedText, 'at', pos.x_coordinate, pos.y_coordinate);
            }
        }
        console.log('SVG texts generated:', svgTexts.length, 'chars');
        console.log('SVG texts content:', svgTexts);

        // Create SVG with embedded base64 image
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${template.image_width}" height="${template.image_height}" viewBox="0 0 ${template.image_width} ${template.image_height}">
    <image href="data:${imageMimeType};base64,${imageBase64}" x="0" y="0" width="${template.image_width}" height="${template.image_height}"/>
    ${svgTexts}
</svg>`;

        // Convert SVG to base64 for ConvertAPI
        const svgBase64 = btoa(unescape(encodeURIComponent(svgContent)));

        // Use ConvertAPI to convert SVG to PNG
        const convertResponse = await fetch('https://v2.convertapi.com/convert/svg/to/png', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONVERTAPI_SECRET}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Parameters: [
                    {
                        Name: 'File',
                        FileValue: {
                            Name: 'coupon.svg',
                            Data: svgBase64
                        }
                    },
                    {
                        Name: 'StoreFile',
                        Value: true
                    }
                ]
            })
        });

        if (!convertResponse.ok) {
            const errorText = await convertResponse.text();
            console.error('ConvertAPI error:', errorText);
            throw new Error(`ConvertAPI failed: ${convertResponse.status}`);
        }

        const convertResult = await convertResponse.json();
        
        // Get the PNG URL from ConvertAPI response
        const pngUrl = convertResult.Files?.[0]?.Url;
        
        if (!pngUrl) {
            throw new Error('No PNG URL in ConvertAPI response');
        }

        // Download the PNG and upload to Base44 storage for permanence
        const pngResponse = await fetch(pngUrl);
        const pngBuffer = await pngResponse.arrayBuffer();
        const pngBlob = new Blob([pngBuffer], { type: 'image/png' });
        const pngFile = new File([pngBlob], `coupon_${couponData.coupon_code}.png`, { type: 'image/png' });
        
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: pngFile });

        console.log('Final image URL:', file_url);
        return Response.json({ image_url: file_url, format: 'png' });
        
    } catch (error) {
        console.error('Error generating coupon image:', error);
        return Response.json({ 
            error: 'Failed to generate coupon image', 
            details: error.message
        }, { status: 500 });
    }
});