import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if WhatsApp integration is enabled
    const settings = await base44.asServiceRole.entities.IntegrationSettings.filter({ 
      integration_name: 'WHATSAPP' 
    });
    
    if (!settings || settings.length === 0 || !settings[0].is_enabled) {
      return Response.json({ 
        error: 'WhatsApp integration is not enabled. Please enable it in Integration Settings.' 
      }, { status: 400 });
    }

    const { phoneNumber, couponImageUrl, couponCode } = await req.json();

    if (!phoneNumber || !couponImageUrl) {
      return Response.json({ 
        error: 'Phone number and coupon image URL are required' 
      }, { status: 400 });
    }

    // Get WhatsApp credentials from environment
    const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');
    const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const WHATSAPP_TEMPLATE_NAME = Deno.env.get('WHATSAPP_TEMPLATE_NAME');

    if (!WHATSAPP_PHONE_ID || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_TEMPLATE_NAME) {
      return Response.json({ 
        error: 'WhatsApp credentials not configured. Please set WHATSAPP_PHONE_ID, WHATSAPP_ACCESS_TOKEN, and WHATSAPP_TEMPLATE_NAME.' 
      }, { status: 500 });
    }

    // Format phone number (remove + and spaces, ensure it starts with country code)
    const formattedPhone = phoneNumber.replace(/[^\d]/g, '');

    // Send image via WhatsApp Business API using approved template
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'template',
          template: {
            name: WHATSAPP_TEMPLATE_NAME,
            language: {
              code: 'en'
            },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'image',
                    image: {
                      link: couponImageUrl
                    }
                  }
                ]
              }
            ]
          }
        })
      }
    );

    if (!whatsappResponse.ok) {
      const errorData = await whatsappResponse.json();
      return Response.json({ 
        error: 'Failed to send WhatsApp message', 
        details: errorData 
      }, { status: 500 });
    }

    const result = await whatsappResponse.json();

    return Response.json({ 
      success: true, 
      messageId: result.messages?.[0]?.id,
      message: 'Coupon sent via WhatsApp successfully' 
    });

  } catch (error) {
    console.error('WhatsApp send error:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});