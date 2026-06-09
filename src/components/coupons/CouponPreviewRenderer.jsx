import React, { forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTemplate, getTemplatePositions } from '@/lib/supabase/queries';
import { Loader2 } from 'lucide-react';

const CouponPreviewRenderer = forwardRef(({ templateId, couponData, className = "" }, ref) => {
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ['template', templateId],
    // Fetch template data by templateId using Supabase query helper
    queryFn: () => getTemplate(templateId),
    enabled: !!templateId,
  });

  const { data: positions = [], isLoading: positionsLoading } = useQuery({
    queryKey: ['template-positions', templateId],
    // Fetch template variable positions by templateId using Supabase query helper
    queryFn: () => getTemplatePositions(templateId),
    enabled: !!templateId,
  });

  const imgRef = React.useRef(null);
  const [imageLoaded, setImageLoaded] = React.useState(false);

  // Map coupon data to variable keys — dynamic, covers all known fields
  // Any template position whose variable_key matches a key here will render
  // Add new keys here when new coupon fields are introduced
  const variableMap = {
    'PLATE_COMBINED_STRING': couponData?.plate_combined_string,
    'ISSUE_DATE': couponData?.issue_date,
    'EXPIRY_DATE': couponData?.expiry_date,
    'COUPON_ID': couponData?.coupon_code,
    'COUPON_CODE': couponData?.coupon_code,
    'CAR_MODEL': couponData?.car_model,
    'OFFER_TITLE': couponData?.offer_title,
    'ADVISOR_NAME': couponData?.advisor_name,
    'CUSTOMER_NAME': couponData?.customer_name,
    'BRANCH_NAME': couponData?.branch_name,
    'IDENTIFIER_TYPE': couponData?.identifier_type,
    'MOBILE_NUMBER': couponData?.mobile_number,
    'PLATE_NUMBER': couponData?.plate_number,
    ...(couponData?.extraVariables || {}),
  };

  // Deduplicate positions by variable_key
  const uniquePositions = positions.reduce((acc, pos) => {
    if (!acc.find(p => p.variable_key === pos.variable_key)) {
      acc.push(pos);
    }
    return acc;
  }, []);

  if (templateLoading || positionsLoading) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-100">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-100">
        <p className="text-slate-500">Template not found</p>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden bg-slate-50 flex items-center justify-center ${className}`}>
      <div ref={ref} className="relative inline-block">
        {/* Background Template Image */}
        <img 
          ref={imgRef}
          src={template.file_url} 
          alt="Coupon Template"
          className="max-w-full h-auto"
          crossOrigin="anonymous"
          style={{ maxHeight: '500px' }}
          onLoad={() => setImageLoaded(true)}
        />
        
        {/* Text Overlays */}
        {imageLoaded && (
          <div className="absolute inset-0">
            {uniquePositions.map((pos) => {
              const value = variableMap[pos.variable_key];
              if (!value || pos.x_coordinate === undefined || pos.y_coordinate === undefined) return null;

              const img = imgRef.current;
              if (!img) return null;

              const displayScale = img.width / img.naturalWidth;

              return (
                <div
                  key={pos.id || pos.variable_key}
                  className="absolute font-bold"
                  style={{
                    left: `${pos.x_coordinate * displayScale}px`,
                    top: `${pos.y_coordinate * displayScale}px`,
                    fontSize: `${(pos.font_size || 16) * displayScale}px`,
                    fontFamily: template.font_family || 'Arial',
                    color: template.text_color || '#000000',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {value}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

CouponPreviewRenderer.displayName = 'CouponPreviewRenderer';

export default CouponPreviewRenderer;