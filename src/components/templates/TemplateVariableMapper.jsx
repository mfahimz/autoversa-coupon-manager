import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, MousePointer, Type } from 'lucide-react';
import { toast } from 'sonner';

export default function TemplateVariableMapper({ template, onClose }) {
  const queryClient = useQueryClient();
  const [positions, setPositions] = useState({});
  const initializedRef = useRef(false);
  const [selectedVariable, setSelectedVariable] = useState(null);
  const imageContainerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);
  
  // Template styling state
  const [templateStyle, setTemplateStyle] = useState({
    font_family: template.font_family || 'Arial',
    text_color: template.text_color || '#000000',
  });

  // Calculate scale to fit viewport (larger preview for better visibility)
  const maxDisplaySize = 1400;
  const scale = Math.min(
    maxDisplaySize / template.image_width,
    maxDisplaySize / template.image_height,
    1 // Never scale up, only down
  );
  const displayWidth = template.image_width * scale;
  const displayHeight = template.image_height * scale;

  const { data: existingPositions = [] } = useQuery({
    queryKey: ['template-positions', template.id],
    queryFn: () => base44.entities.TemplateVariablePosition.filter({ template_id: template.id }),
  });

  // Query to fetch the linked offer configuration
  const { data: linkedOffer } = useQuery({
    queryKey: ['offer', template.offer_id],
    queryFn: () => base44.entities.Offer.get(template.offer_id),
    enabled: !!template.offer_id,
  });

  // Dynamic variable keys — driven by linked offer's offer_variables (print: true only)
  // Falls back to 4 defaults if no offer linked or no print variables configured
  // Updated: 2026-05-25
  // Default fallback variables — used when no offer is linked or offer has no variables configured
  const DEFAULT_VARIABLE_KEYS = [
    { key: 'PLATE_COMBINED_STRING', label: 'Plate Number', sample: '12345-DXBA' },
    { key: 'ISSUE_DATE', label: 'Issue Date', sample: '01-01-2025' },
    { key: 'EXPIRY_DATE', label: 'Expiry Date', sample: '31-01-2025' },
    { key: 'COUPON_ID', label: 'Coupon Code', sample: '0001_ALMOFF_12345-DXBA' },
  ];

  // Sample values for known auto-filled variable keys
  const VARIABLE_SAMPLES = {
    'PLATE_COMBINED_STRING': '12345-DXBA',
    'ISSUE_DATE': '01-01-2025',
    'EXPIRY_DATE': '31-01-2025',
    'COUPON_ID': '0001_ALMOFF_12345-DXBA',
    'ADVISOR_NAME': 'John Smith',
    'CAR_MODEL': 'C-Class',
    'CUSTOMER_NAME': 'Ahmed Al Maraghi',
    'BRANCH_NAME': 'Main Branch',
  };

  // Build variable keys from linked offer's offer_variables — only include variables marked print: true
  const VARIABLE_KEYS = (() => {
    if (!linkedOffer?.offer_variables) return DEFAULT_VARIABLE_KEYS;
    try {
      const parsed = JSON.parse(linkedOffer.offer_variables);
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_VARIABLE_KEYS;
      // Only show variables where print === true
      const printVars = parsed.filter(v => v.print === true);
      if (printVars.length === 0) return DEFAULT_VARIABLE_KEYS;
      return printVars.map(v => ({
        key: v.key,
        label: v.label,
        sample: VARIABLE_SAMPLES[v.key] || v.label,
      }));
    } catch {
      return DEFAULT_VARIABLE_KEYS;
    }
  })();

  // Effect to reset when template changes
  useEffect(() => {
    initializedRef.current = false;
    setPositions({});
    setTemplateStyle({
      font_family: template.font_family || 'Arial',
      text_color: template.text_color || '#000000',
    });
  }, [template.id]);

  // Effect to initialize positions from existing data
  useEffect(() => {
    if (!initializedRef.current && existingPositions.length >= 0) {
      const newPosMap = {};
      existingPositions.forEach(pos => {
        newPosMap[pos.variable_key] = {
          x: pos.x_coordinate,
          y: pos.y_coordinate,
          font_size: pos.font_size || 12,
          default_value: pos.default_value || '',
          id: pos.id,
        };
      });
      setPositions(newPosMap);
      initializedRef.current = true;
    }
  }, [existingPositions]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const promises = [];
      for (const [variable_key, coords] of Object.entries(data)) {
        // Only save if both x and y are set (including 0)
        if (coords.x !== undefined && coords.x !== null && coords.x !== '' && 
            coords.y !== undefined && coords.y !== null && coords.y !== '') {
          if (coords.id) {
            promises.push(
              base44.entities.TemplateVariablePosition.update(coords.id, {
                x_coordinate: coords.x,
                y_coordinate: coords.y,
                font_size: coords.font_size || 12,
                default_value: coords.default_value || '',
              })
            );
          } else {
            promises.push(
              base44.entities.TemplateVariablePosition.create({
                template_id: template.id,
                variable_key,
                x_coordinate: coords.x,
                y_coordinate: coords.y,
                font_size: coords.font_size || 12,
                default_value: coords.default_value || '',
              })
            );
          }
        }
      }
      
      if (promises.length === 0) {
        toast.error('Please set at least one variable position');
        throw new Error('No positions to save');
      }
      
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-positions'] });
      toast.success('Variable positions saved successfully');
      onClose();
    },
    onError: (error) => {
      if (error.message !== 'No positions to save') {
        toast.error('Failed to save positions: ' + error.message);
      }
    },
  });

  const templateStyleMutation = useMutation({
    mutationFn: (data) => base44.entities.Template.update(template.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['template', template.id] });
      toast.success('Template styling updated');
    },
  });

  const handlePositionChange = (variableKey, field, value) => {
    setPositions(prev => {
      const existingData = prev[variableKey] || { font_size: 12, default_value: '' };
      return {
        ...prev,
        [variableKey]: {
          ...existingData,
          [field]: field === 'default_value' ? value : (parseFloat(value) || 0),
        },
      };
    });
  };

  const handleSave = async () => {
    // First save the positions
    await saveMutation.mutateAsync(positions);
    // Invalidate queries to reload fresh data
    queryClient.invalidateQueries({ queryKey: ['template-positions', template.id] });
  };

  const handleImageClick = (e) => {
    if (!selectedVariable) {
      toast.error('Please select a variable first');
      return;
    }

    const img = imageContainerRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate the scale based on displayed vs actual dimensions
    const displayScale = img.naturalWidth / img.width;
    
    // Convert display coordinates to actual image coordinates
    const imageX = Math.round(x * displayScale);
    const imageY = Math.round(y * displayScale);

    setPositions(prev => {
      const existingData = prev[selectedVariable] || { font_size: 12, default_value: '' };
      return {
        ...prev,
        [selectedVariable]: {
          ...existingData,
          x: imageX,
          y: imageY,
        },
      };
    });

    toast.success(`Position set: X=${imageX}, Y=${imageY}`);
  };

  const handleMouseMove = (e) => {
    const img = imageContainerRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate the scale based on displayed vs actual dimensions
    const displayScale = img.naturalWidth / img.width;
    
    // Convert display coordinates to actual image coordinates
    const imageX = Math.round(x * displayScale);
    const imageY = Math.round(y * displayScale);

    setCursorPosition({ x: imageX, y: imageY });
  };

  return (
    <Card className="border-2 border-blue-200 shadow-xl">
      <CardHeader className="bg-blue-50 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MousePointer className="w-5 h-5 text-blue-600" />
            Configure Variable Positions: {template.name}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Image Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Template Preview</h3>
              <Button
                size="sm"
                variant={showPreview ? "default" : "outline"}
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? 'Edit Mode' : 'Preview Sample'}
              </Button>
            </div>
            {selectedVariable && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Click mode active:</strong> Click on the image to set position for{' '}
                  <strong>{VARIABLE_KEYS.find(v => v.key === selectedVariable)?.label}</strong>
                </p>
              </div>
            )}
            {!showPreview && imageLoaded && (
              <div className="bg-slate-900 text-white px-3 py-2 rounded text-sm font-mono">
                Cursor: X = {cursorPosition.x}px, Y = {cursorPosition.y}px
              </div>
            )}
            
            {showPreview ? (
              <div className="border-2 border-green-200 rounded-lg overflow-hidden bg-white p-4">
                <div className="relative inline-block">
                  <img
                    ref={imageContainerRef}
                    src={template.file_url}
                    alt="Template"
                    className="max-w-full h-auto border border-slate-200 rounded"
                    style={{ maxHeight: '500px' }}
                    onLoad={() => setImageLoaded(true)}
                  />
                  <div className="absolute inset-0">
                    {/* Render sample text overlays */}
                    {imageLoaded && Object.entries(positions).map(([key, pos]) => {
                      if (!pos.x || !pos.y) return null;
                      const variable = VARIABLE_KEYS.find(v => v.key === key);
                      const sampleText = variable?.sample || 'Sample';
                      
                      const img = imageContainerRef.current;
                      if (!img) return null;
                      
                      const displayScale = img.width / img.naturalWidth;
                      
                      return (
                        <div
                          key={key}
                          className="absolute font-bold"
                          style={{
                            left: `${pos.x * displayScale}px`,
                            top: `${pos.y * displayScale}px`,
                            fontSize: `${(pos.font_size || 16) * displayScale}px`,
                            fontFamily: templateStyle.font_family,
                            color: templateStyle.text_color,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sampleText}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-2 border-slate-200 rounded-lg overflow-hidden bg-slate-900 p-4">
                <div className="relative inline-block">
                  <img
                    ref={imageContainerRef}
                    src={template.file_url}
                    alt="Template"
                    className="max-w-full h-auto cursor-crosshair"
                    style={{ maxHeight: '500px' }}
                    onLoad={() => setImageLoaded(true)}
                    onClick={handleImageClick}
                    onMouseMove={handleMouseMove}
                  />

                  {/* Grid overlay */}
                  {imageLoaded && (
                    <svg 
                      className="absolute inset-0 w-full h-full pointer-events-none z-10" 
                      style={{ opacity: 0.3 }}
                    >
                      <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="cyan" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                  )}

                  {/* Position markers */}
                  {imageLoaded && Object.entries(positions).map(([key, pos]) => {
                    if (!pos.x || !pos.y) return null;

                    const img = imageContainerRef.current;
                    if (!img) return null;

                    const displayScale = img.width / img.naturalWidth;
                    const displayX = pos.x * displayScale;
                    const displayY = pos.y * displayScale;

                    return (
                      <div key={key}>
                        <div
                          className="absolute w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg z-20"
                          style={{
                            left: `${displayX}px`,
                            top: `${displayY}px`,
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          className="absolute text-xs bg-black text-white px-2 py-1 rounded z-20 font-mono"
                          style={{
                            left: `${displayX + 10}px`,
                            top: `${displayY - 10}px`,
                            pointerEvents: 'none',
                          }}
                        >
                          {pos.x},{pos.y}
                        </div>
                      </div>
                    );
                    })}
                    </div>
                    </div>
                    )}
                    <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                💡 <strong>Tip:</strong> Select a variable below, then click on the image to set its position.
              </p>
              <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded">
                {template.image_width} × {template.image_height}px
              </div>
            </div>
          </div>

          {/* Variable Configuration */}
          <div className="space-y-6">
            {/* Global Template Styling */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Type className="w-4 h-4 text-blue-600" />
                Template Text Styling
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">Font Family</Label>
                  <Select
                    value={templateStyle.font_family}
                    onValueChange={(value) => {
                      const newStyle = { ...templateStyle, font_family: value };
                      setTemplateStyle(newStyle);
                      templateStyleMutation.mutate(newStyle);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Font" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Arial", "Times New Roman", "Courier New", "Verdana", "Georgia", "Tahoma", "Trebuchet MS", "Impact"].map(font => (
                        <SelectItem key={font} value={font}>
                          <span style={{ fontFamily: font }}>{font}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600 mb-1.5 block">Text Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={templateStyle.text_color}
                      onChange={(e) => {
                        const newStyle = { ...templateStyle, text_color: e.target.value };
                        setTemplateStyle(newStyle);
                      }}
                      onBlur={() => templateStyleMutation.mutate(templateStyle)}
                      className="w-12 h-9 p-1 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-500">{templateStyle.text_color}</span>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="font-semibold text-slate-900">Variable Positions</h3>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
              {VARIABLE_KEYS.map(({ key, label }) => (
                <Card 
                  key={key} 
                  className={`cursor-pointer transition-all ${
                    selectedVariable === key 
                      ? 'bg-blue-100 border-2 border-blue-500' 
                      : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                  onClick={() => setSelectedVariable(key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">{label}</Label>
                      {selectedVariable === key && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                          Click Image
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs text-slate-600">X</Label>
                          <Input
                            type="number"
                            value={positions[key]?.x || ''}
                            onChange={(e) => handlePositionChange(key, 'x', e.target.value)}
                            placeholder="e.g., 100"
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Y</Label>
                          <Input
                            type="number"
                            value={positions[key]?.y || ''}
                            onChange={(e) => handlePositionChange(key, 'y', e.target.value)}
                            placeholder="e.g., 200"
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Font Size</Label>
                          <Input
                            type="number"
                            value={positions[key]?.font_size || 12}
                            onChange={(e) => handlePositionChange(key, 'font_size', e.target.value)}
                            placeholder="12"
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Default Value (Optional)</Label>
                        <Input
                          type="text"
                          value={positions[key]?.default_value || ''}
                          onChange={(e) => handlePositionChange(key, 'default_value', e.target.value)}
                          placeholder="Pre-fill value for this field"
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save All Positions'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}