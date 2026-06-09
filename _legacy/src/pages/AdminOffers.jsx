import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Import Lucide icons, including Info for detail tooltips
// Import Lucide icons, including additional icons for template management: Upload, FileText, Star, Edit2
import { Plus, Edit, Save, X, Tag, Trash2, Search, UserPlus, Users, Info, Upload, FileText, Star, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
// Import the TemplateVariableMapper component to allow positioning of coupon variables on templates
import TemplateVariableMapper from '../components/templates/TemplateVariableMapper';

export default function AdminOffers() {
  const [editingOffer, setEditingOffer] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    customer_status: 'NEW',
    valid_days: 30,
    terms_and_conditions: '',
    is_active: true,
    template_id: '',
    coupon_code_structure: '',
    customizable_variables: '',
    vehicle_config: '{"mode":"any_brand","brands":[],"models":{}}',
    offer_variables: '[]'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCustomerType, setFilterCustomerType] = useState('ALL');

  // Multi-step form step state
  const [formStep, setFormStep] = useState(1);

  // Brand and option input temp states for Steps 2 & 3
  const [modelInputs, setModelInputs] = useState({});
  const [optionInputs, setOptionInputs] = useState({});
  
  // Custom variable creation temp states
  const [customVarKey, setCustomVarKey] = useState('');
  const [customVarLabel, setCustomVarLabel] = useState('');
  const [customVarType, setCustomVarType] = useState('text');

  // --- TEMPLATE MANAGEMENT STATE (Merged from AdminTemplates) ---
  // Tracks if the template upload modal/form is open
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  // Tracks which offer ID we are uploading the template for
  const [uploadingForOfferId, setUploadingForOfferId] = useState(null);
  // Form state for template upload details
  const [templateFormData, setTemplateFormData] = useState({ name: '', file: null, coupon_code_prefix: '', is_active: true });
  // Loading state during template upload process
  const [templateUploading, setTemplateUploading] = useState(false);
  // Tracks which template is currently being mapped with variable coordinates
  const [mappingTemplate, setMappingTemplate] = useState(null);
  // Image preview data URL for local display before upload
  const [templateImagePreview, setTemplateImagePreview] = useState(null);
  // Cached dimensions of the template image for rendering coordinate space
  const [templateImageDimensions, setTemplateImageDimensions] = useState({ width: 0, height: 0 });

  // Predefined vehicle brands list for Step 2
  const VEHICLE_BRANDS = [
    'Mercedes-Benz', 'BMW', 'Audi', 'Volkswagen', 'Toyota', 
    'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Hyundai', 
    'Kia', 'Lexus', 'Porsche', 'Land Rover', 'Jeep', 'Other'
  ];

  // Master variables list for Step 3
  const MASTER_VARIABLES = [
    { key: 'COUPON_ID', label: 'Coupon Code', auto: true },
    { key: 'PLATE_COMBINED_STRING', label: 'Plate / Mobile', auto: true },
    { key: 'ISSUE_DATE', label: 'Issue Date', auto: true },
    { key: 'EXPIRY_DATE', label: 'Expiry Date', auto: true },
    { key: 'ADVISOR_NAME', label: 'Advisor Name', auto: true },
    { key: 'CAR_MODEL', label: 'Car Model', auto: false },
    { key: 'CUSTOMER_NAME', label: 'Customer Name', auto: false },
    { key: 'BRANCH_NAME', label: 'Branch Name', auto: false },
  ];

  // Parsed vehicle configuration from JSON
  const vehicleConfig = (() => {
    try {
      return JSON.parse(formData.vehicle_config || '{}');
    } catch {
      return { mode: 'any_brand', brands: [], models: {} };
    }
  })();

  // Helper to update vehicle config and stringify
  const updateVehicleConfig = (updates) => {
    const current = vehicleConfig;
    setFormData(prev => ({
      ...prev,
      vehicle_config: JSON.stringify({ ...current, ...updates })
    }));
  };

  // Parsed offer variables from JSON
  const offerVariables = (() => {
    try {
      return JSON.parse(formData.offer_variables || '[]');
    } catch {
      return [];
    }
  })();

  // Helper to update offer variables and stringify
  const updateOfferVariables = (newVars) => {
    setFormData(prev => ({
      ...prev,
      offer_variables: JSON.stringify(newVars)
    }));
  };

  // Model adding/removing helpers
  const handleAddModel = (brandName) => {
    const val = (modelInputs[brandName] || '').trim();
    if (val) {
      const currentModels = vehicleConfig.models || {};
      const brandModels = currentModels[brandName] || [];
      if (!brandModels.includes(val)) {
        const updatedModels = {
          ...currentModels,
          [brandName]: [...brandModels, val]
        };
        updateVehicleConfig({ models: updatedModels });
      }
      setModelInputs(prev => ({ ...prev, [brandName]: '' }));
    }
  };

  const handleRemoveModel = (brandName, modelToRemove) => {
    const currentModels = vehicleConfig.models || {};
    const brandModels = currentModels[brandName] || [];
    const updatedModels = {
      ...currentModels,
      [brandName]: brandModels.filter(m => m !== modelToRemove)
    };
    updateVehicleConfig({ models: updatedModels });
  };

  // Master variables list toggling helper
  const toggleMasterVariable = (item) => {
    const exists = offerVariables.some(v => v.key === item.key);
    if (exists === true) {
      const newVars = offerVariables.filter(v => v.key !== item.key);
      updateOfferVariables(newVars);
    } else {
      const newVars = [
        ...offerVariables,
        {
          key: item.key,
          label: item.label,
          auto: item.auto,
          print: false,
          type: item.auto === true ? 'auto' : 'text',
          options: []
        }
      ];
      updateOfferVariables(newVars);
    }
  };

  // Custom variables helper functions
  const handleCustomKeyChange = (val) => {
    const formatted = val.toUpperCase().replace(/\s+/g, '_');
    setCustomVarKey(formatted);
  };

  const handleAddCustomVariable = () => {
    const key = customVarKey.trim();
    const label = customVarLabel.trim();
    if (!key || !label) {
      toast.error('Key and Label are required for custom variables');
      return;
    }
    if (offerVariables.some(v => v.key === key) === true) {
      toast.error(`Variable with key "${key}" already exists`);
      return;
    }
    const newVar = {
      key,
      label,
      auto: false,
      print: false,
      type: customVarType,
      options: []
    };
    updateOfferVariables([...offerVariables, newVar]);
    setCustomVarKey('');
    setCustomVarLabel('');
    setCustomVarType('text');
  };

  // Configured variables helpers
  const togglePrint = (idx) => {
    const newVars = [...offerVariables];
    newVars[idx] = {
      ...newVars[idx],
      print: newVars[idx].print === true ? false : true
    };
    updateOfferVariables(newVars);
  };

  const handleTypeChange = (idx, newType) => {
    const newVars = [...offerVariables];
    newVars[idx] = { ...newVars[idx], type: newType };
    updateOfferVariables(newVars);
  };

  const handleAddOption = (idx, variableKey) => {
    const val = (optionInputs[variableKey] || '').trim();
    if (val) {
      const newVars = [...offerVariables];
      const currentOptions = newVars[idx].options || [];
      if (!currentOptions.includes(val)) {
        newVars[idx] = { ...newVars[idx], options: [...currentOptions, val] };
        updateOfferVariables(newVars);
      }
      setOptionInputs(prev => ({ ...prev, [variableKey]: '' }));
    }
  };

  const handleRemoveOption = (idx, optionToRemove) => {
    const newVars = [...offerVariables];
    const currentOptions = newVars[idx].options || [];
    newVars[idx] = { ...newVars[idx], options: currentOptions.filter(o => o !== optionToRemove) };
    updateOfferVariables(newVars);
  };

  const handleRemoveVariable = (keyToRemove) => {
    const newVars = offerVariables.filter(v => v.key !== keyToRemove);
    updateOfferVariables(newVars);
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    const newVars = [...offerVariables];
    const temp = newVars[idx];
    newVars[idx] = newVars[idx - 1];
    newVars[idx - 1] = temp;
    updateOfferVariables(newVars);
  };

  const moveDown = (idx) => {
    if (idx === offerVariables.length - 1) return;
    const newVars = [...offerVariables];
    const temp = newVars[idx];
    newVars[idx] = newVars[idx + 1];
    newVars[idx + 1] = temp;
    updateOfferVariables(newVars);
  };

  // --- TEMPLATE HELPER FUNCTIONS (Merged from AdminTemplates) ---

  // Handles template image file selection, reads file locally, and determines its dimensions
  const handleTemplateFileChange = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
      setTemplateFormData(prev => ({ ...prev, file }));
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setTemplateImageDimensions({ width: img.width, height: img.height });
        };
        img.src = event.target.result;
        setTemplateImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      toast.error('Please select a PNG or JPG image file');
    }
  };

  // Uploads the selected template file to storage and saves metadata in the Template entity
  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    if (!templateFormData.file) {
      toast.error('Please select an image file');
      return;
    }
    if (!templateImageDimensions.width || !templateImageDimensions.height) {
      toast.error('Please wait for image to load completely');
      return;
    }
    try {
      setTemplateUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: templateFormData.file });
      await templateCreateMutation.mutateAsync({
        name: templateFormData.name,
        file_url,
        image_width: templateImageDimensions.width,
        image_height: templateImageDimensions.height,
        offer_id: uploadingForOfferId,
        coupon_code_prefix: templateFormData.coupon_code_prefix || 'ALMOFF',
        is_active: templateFormData.is_active === true,
        is_default: false,
      });
    } catch (error) {
      toast.error('Failed to upload template: ' + error.message);
    } finally {
      setTemplateUploading(false);
    }
  };

  // Unsets any existing default template and marks the selected template as default
  const setTemplateAsDefault = async (template) => {
    const otherTemplates = templates.filter(t => t.id !== template.id && t.is_default === true);
    await Promise.all(
      otherTemplates.map(t => base44.entities.Template.update(t.id, { is_default: false }))
    );
    templateUpdateMutation.mutate({ id: template.id, data: { is_default: true } });
  };

  // Resets the template upload form and state variables
  const cancelTemplateUpload = () => {
    setIsUploadingTemplate(false);
    setUploadingForOfferId(null);
    setTemplateFormData({ name: '', file: null, coupon_code_prefix: '', is_active: true });
    setTemplateImagePreview(null);
    setTemplateImageDimensions({ width: 0, height: 0 });
  };

  // Step-by-step navigation helpers
  const handleNextStep = () => {
    if (formStep === 1) {
      if (!formData.title.trim()) {
        toast.error('Offer Title is required');
        return;
      }
    }
    setFormStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setFormStep(prev => Math.max(1, prev - 1));
  };

  const queryClient = useQueryClient();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.list('-created_date'),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const offer = await base44.entities.Offer.create(data);
      
      // If template selected, link it to this offer
      if (data.template_id) {
        // First, unlink any template previously linked to this offer
        const existingTemplates = await base44.entities.Template.filter({ offer_id: offer.id });
        for (const t of existingTemplates) {
          if (t.id !== data.template_id) {
            await base44.entities.Template.update(t.id, { offer_id: null });
          }
        }
        
        // Link the selected template
        await base44.entities.Template.update(data.template_id, { offer_id: offer.id });
      }
      
      return offer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsCreating(false);
      setFormData({
        title: '',
        description: '',
        customer_status: 'NEW',
        valid_days: 30,
        terms_and_conditions: '',
        is_active: true,
        template_id: '',
        coupon_code_structure: '',
        customizable_variables: '',
        vehicle_config: '{"mode":"any_brand","brands":[],"models":{}}',
        offer_variables: '[]'
      });
      setFormStep(1);
      toast.success('Offer created successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const offer = await base44.entities.Offer.update(id, data);
      
      // Unlink all templates from this offer first
      const allTemplates = await base44.entities.Template.filter({ offer_id: id });
      for (const t of allTemplates) {
        await base44.entities.Template.update(t.id, { offer_id: null });
      }
      
      // If template selected, link it to this offer
      if (data.template_id) {
        await base44.entities.Template.update(data.template_id, { offer_id: id });
      }
      
      return offer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setEditingOffer(null);
      toast.success('Offer updated successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Offer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offer deleted successfully');
    },
  });

  // --- TEMPLATE MUTATIONS (Merged from AdminTemplates) ---

  // Mutation to create a new template and immediately open the coordinate mapper upon success
  const templateCreateMutation = useMutation({
    mutationFn: (data) => base44.entities.Template.create(data),
    onSuccess: (createdTemplate) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsUploadingTemplate(false);
      setUploadingForOfferId(null);
      setTemplateFormData({ name: '', file: null, coupon_code_prefix: '', is_active: true });
      setTemplateImagePreview(null);
      setTemplateImageDimensions({ width: 0, height: 0 });
      toast.success('Template uploaded — now configure variable positions');
      setMappingTemplate(createdTemplate);
    },
  });

  // Mutation to update an existing template's attributes
  const templateUpdateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Template.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template updated successfully');
    },
  });

  // Mutation to delete a template from the database
  const templateDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Template.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template deleted successfully');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingOffer) {
      updateMutation.mutate({ id: editingOffer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (offer) => {
    setEditingOffer(offer);
    const linkedTemplate = templates.find(t => t.offer_id === offer.id);
    setFormData({
      title: offer.title,
      description: offer.description || '',
      customer_status: offer.customer_status || 'NEW',
      valid_days: offer.valid_days || 30,
      terms_and_conditions: offer.terms_and_conditions || '',
      is_active: offer.is_active,
      template_id: linkedTemplate?.id || '',
      coupon_code_structure: offer.coupon_code_structure || '',
      customizable_variables: offer.customizable_variables || '',
      vehicle_config: offer.vehicle_config || '{"mode":"any_brand","brands":[],"models":{}}',
      offer_variables: offer.offer_variables || '[]'
    });
    setIsCreating(false);
    setFormStep(1);
  };

  const cancelEdit = () => {
    setEditingOffer(null);
    setIsCreating(false);
    setFormData({
      title: '',
      description: '',
      customer_status: 'NEW',
      valid_days: 30,
      terms_and_conditions: '',
      is_active: true,
      template_id: '',
      coupon_code_structure: '',
      customizable_variables: '',
      vehicle_config: '{"mode":"any_brand","brands":[],"models":{}}',
      offer_variables: '[]'
    });
    setFormStep(1);
  };

  // Filtered offers based on search and filters
  const filteredOffers = useMemo(() => {
    return offers.filter(offer => {
      const matchesSearch = offer.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (offer.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'ALL' || 
                           (filterStatus === 'ACTIVE' ? offer.is_active : !offer.is_active);
      const matchesCustomerType = filterCustomerType === 'ALL' || 
                                  offer.customer_status === filterCustomerType;
      return matchesSearch && matchesStatus && matchesCustomerType;
    });
  }, [offers, searchTerm, filterStatus, filterCustomerType]);

  return (
    <div className="space-y-6">
      {/* Template variable mapper — renders inline when a template is selected for configuration */}
      {mappingTemplate && (
        <TemplateVariableMapper
          template={mappingTemplate}
          onClose={() => setMappingTemplate(null)}
        />
      )}

      {/* Template upload form — shown when admin clicks Upload Template on an offer card */}
      {isUploadingTemplate && uploadingForOfferId && !mappingTemplate && (
        /* Custom styled template upload card container with shadow and borderless style */
        <Card className="shadow-xl border-0 overflow-hidden">
          {/* Custom header with dark background and thin border */}
          <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Gold colored icon and styled title text */}
                <Upload className="w-5 h-5" style={{ color: '#C9A84C' }} />
                <span className="text-white font-semibold">Upload Template for: {offers.find(o => o.id === uploadingForOfferId)?.title || 'Offer'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={cancelTemplateUpload}>
                <X className="w-5 h-5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleTemplateSubmit} className="space-y-4">
              <div>
                <Label htmlFor="template_name">Template Name *</Label>
                <Input
                  id="template_name"
                  value={templateFormData.name}
                  onChange={(e) => setTemplateFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Summer Special Template"
                  required
                />
              </div>
              <div>
                <Label htmlFor="template_file">Image File (PNG/JPG) *</Label>
                <Input
                  id="template_file"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleTemplateFileChange}
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Upload a PNG or JPG image to use as coupon template</p>
                {templateImagePreview && (
                  <div className="mt-3">
                    <p className="text-sm text-slate-600 mb-2">Preview:</p>
                    <img
                      src={templateImagePreview}
                      alt="Template preview"
                      className="max-w-full h-auto border border-slate-200 rounded"
                      style={{ maxHeight: '300px' }}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Dimensions: {templateImageDimensions.width} × {templateImageDimensions.height} pixels
                    </p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="template_prefix">Coupon Code Prefix *</Label>
                <Input
                  id="template_prefix"
                  value={templateFormData.coupon_code_prefix}
                  onChange={(e) => setTemplateFormData(prev => ({ ...prev, coupon_code_prefix: e.target.value.toUpperCase() }))}
                  placeholder="e.g., ALMOFF, BMW"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Short code prefix used in generated coupon codes</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={templateFormData.is_active === true}
                  onCheckedChange={(checked) => setTemplateFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Active</Label>
              </div>
              <div className="flex gap-3 pt-2">
                {/* Template upload submit button with custom gold gradient styling */}
                <Button
                  type="submit"
                  disabled={templateUploading || !templateImageDimensions.width || !templateImageDimensions.height}
                  className="text-white font-medium" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
                >
                  {templateUploading ? 'Uploading...' : 'Upload Template'}
                </Button>
                <Button type="button" variant="outline" onClick={cancelTemplateUpload}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">After uploading, you will be taken directly to configure variable positions on the template.</p>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          {/* Modified title with tighter tracking and custom text for Al Maraghi */}
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Manage Offers</h1>
          {/* Change 2: Updated subtitle to refer to Al Maraghi Motors */}
          <p className="text-slate-500 mt-1 text-sm">Create and manage coupon offers for Al Maraghi Motors</p>
        </div>
        {!isCreating && !editingOffer && (
          /* Custom styled New Offer button with brand gold gradient and shadow */
          <Button onClick={() => setIsCreating(true)} className="text-white font-medium shadow-sm" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
            <Plus className="w-4 h-4 mr-2" />
            New Offer
          </Button>
        )}
      </div>

      {/* Custom styled form card container with shadow and no border */}
      {(isCreating || editingOffer) && (
        <Card className="shadow-xl border-0 overflow-hidden">
          {/* Header with dark background and thin border */}
          <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
            <CardTitle className="flex items-center gap-2">
              {/* Gold colored icon and styled title text */}
              <Tag className="w-5 h-5" style={{ color: '#C9A84C' }} />
              <span className="text-white font-semibold">{editingOffer ? 'Edit Offer' : 'Create New Offer'}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Multi-step offer form — Step 1: Basic Info, Step 2: Vehicles, Step 3: Variables, Step 4: Code & Template — updated 2026-05-25 */}
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Step Indicator */}
              {/* Flex container for step indicators without border-b */}
              <div className="flex flex-wrap items-center gap-2 pb-4 mb-6">
                {[
                  { step: 1, label: 'Step 1: Basic Info' },
                  { step: 2, label: 'Step 2: Vehicles' },
                  { step: 3, label: 'Step 3: Variables' },
                  { step: 4, label: 'Step 4: Code & Template' },
                ].map((s) => (
                  /* Pill-shaped step indicators with custom active/inactive styling */
                  <div
                    key={s.step}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      formStep === s.step
                        ? 'text-white border-transparent'
                        : 'text-slate-400 border-slate-200 bg-white'
                    }`}
                    style={formStep === s.step ? { background: 'linear-gradient(135deg, #C9A84C, #8B6914)', borderColor: 'transparent' } : {}}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {/* STEP 1: Basic Info */}
              {formStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Offer Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Free Computer Scan, 20% off labour"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional longer description"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      {/* Form field label updated from Customer Status to Identifier Type */}
                      <Label htmlFor="customer_status">Identifier Type *</Label>
                      <Select
                        value={formData.customer_status}
                        onValueChange={(value) => setFormData({ ...formData, customer_status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select customer status" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Options updated to Mobile/Plate labels without extra text - 2026-06-05 */}
                          <SelectItem value="NEW">Mobile Number</SelectItem>
                          <SelectItem value="EXISTING">Plate Number</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500 mt-1">New = Mobile, Existing = Plate</p>
                    </div>
                    <div>
                      <Label htmlFor="valid_days">Default Validity (days) *</Label>
                      <Input
                        id="valid_days"
                        type="number"
                        value={formData.valid_days}
                        onChange={(e) => setFormData({ ...formData, valid_days: e.target.value })}
                        min="1"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="terms_and_conditions">Terms & Conditions</Label>
                    <div className="border border-slate-300 rounded-md overflow-hidden bg-white">
                      <ReactQuill
                        theme="snow"
                        value={formData.terms_and_conditions}
                        onChange={(value) => setFormData({ ...formData, terms_and_conditions: value })}
                        placeholder="Enter specific terms for this offer..."
                        modules={{
                          toolbar: [
                            ['bold', 'italic', 'underline'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            ['clean']
                          ]
                        }}
                        style={{ minHeight: '120px' }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Leave empty to use default terms
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={formData.is_active === true}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label>Active (available for CRE selection)</Label>
                  </div>
                </div>
              )}

              {/* STEP 2: Vehicle Configuration */}
              {formStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Vehicle Brand Scope</Label>
                    <div className="flex gap-2">
                      {[
                        { value: 'any_brand', label: 'Any Brand' },
                        { value: 'multi_brand', label: 'Multiple Brands' },
                        { value: 'single_brand', label: 'Single Brand' },
                      ].map((opt) => (
                        <Button
                          key={opt.value}
                          type="button"
                          variant={vehicleConfig.mode === opt.value ? 'default' : 'outline'}
                          onClick={() => {
                            updateVehicleConfig({ mode: opt.value });
                          }}
                          className={`flex-1 ${
                            vehicleConfig.mode === opt.value ? 'bg-blue-600 hover:bg-blue-700 text-white font-medium' : ''
                          }`}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {(vehicleConfig.mode === 'single_brand' || vehicleConfig.mode === 'multi_brand') && (
                    <div className="space-y-2 mt-4">
                      <Label>Select Vehicle Brand(s)</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border p-3 rounded-md bg-slate-50">
                        {VEHICLE_BRANDS.map((brand) => {
                          const isChecked = (vehicleConfig.brands || []).includes(brand);
                          return (
                            <label
                              key={brand}
                              className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer p-1.5 hover:bg-slate-100 rounded"
                            >
                              {vehicleConfig.mode === 'single_brand' ? (
                                <input
                                  type="radio"
                                  name="vehicle_brand_radio"
                                  checked={isChecked}
                                  onChange={() => {
                                    updateVehicleConfig({ brands: [brand] });
                                  }}
                                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const currentBrands = vehicleConfig.brands || [];
                                    const updated = currentBrands.includes(brand)
                                      ? currentBrands.filter((b) => b !== brand)
                                      : [...currentBrands, brand];
                                    updateVehicleConfig({ brands: updated });
                                  }}
                                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                />
                              )}
                              {brand}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {((vehicleConfig.mode === 'single_brand' || vehicleConfig.mode === 'multi_brand') &&
                    (vehicleConfig.brands || []).length > 0) && (
                    <div className="space-y-4 mt-4">
                      <Label className="text-base font-semibold">Models Configuration</Label>
                      <div className="space-y-3">
                        {(vehicleConfig.brands || []).map((brandName) => {
                          const brandModels = (vehicleConfig.models || {})[brandName] || [];
                          return (
                            <div key={brandName} className="border p-3 rounded-md bg-white space-y-2">
                              <span className="font-semibold text-sm text-slate-700 block">{brandName}</span>
                              <div className="flex gap-2">
                                <Input
                                  type="text"
                                  placeholder={`Add ${brandName} model...`}
                                  value={modelInputs[brandName] || ''}
                                  onChange={(e) =>
                                    setModelInputs((prev) => ({ ...prev, [brandName]: e.target.value }))
                                  }
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  onClick={() => handleAddModel(brandName)}
                                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-3"
                                >
                                  Add
                                </Button>
                              </div>
                              {brandModels.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {brandModels.map((model) => (
                                    <span
                                      key={model}
                                      className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-medium"
                                    >
                                      {model}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveModel(brandName, model)}
                                        className="text-slate-400 hover:text-slate-600 font-bold ml-0.5"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Offer Variables */}
              {formStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <Label className="text-base font-semibold mb-2 block">Select Offer Variables</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {MASTER_VARIABLES.map((item) => {
                        const isSelected = offerVariables.some((v) => v.key === item.key);
                        return (
                          <div
                            key={item.key}
                            onClick={() => toggleMasterVariable(item)}
                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all flex flex-col justify-between ${
                              isSelected === true
                                ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                              <input
                                type="checkbox"
                                checked={isSelected === true}
                                readOnly
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-mono text-[10px] text-slate-500">{item.key}</span>
                              {item.auto === true ? (
                                <span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded">
                                  Auto
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-medium rounded">
                                  Manual
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border border-slate-200 p-4 rounded-lg bg-slate-50 space-y-3">
                    <h4 className="font-semibold text-sm text-slate-700">Add Custom Variable</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="custom_key">Variable Key</Label>
                        <Input
                          id="custom_key"
                          type="text"
                          placeholder="e.g. EXTRA_DISCOUNT"
                          value={customVarKey}
                          onChange={(e) => handleCustomKeyChange(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="custom_label">Variable Label</Label>
                        <Input
                          id="custom_label"
                          type="text"
                          placeholder="e.g. Extra Discount %"
                          value={customVarLabel}
                          onChange={(e) => setCustomVarLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="custom_type">Type</Label>
                        <Select value={customVarType} onValueChange={setCustomVarType}>
                          <SelectTrigger id="custom_type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddCustomVariable}
                      className="bg-slate-800 hover:bg-slate-900 text-white w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Custom Variable
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-semibold block">Configured Variables List</Label>
                    {offerVariables.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No variables configured yet. Select from the master list or add a custom variable above.</p>
                    ) : (
                      <div className="space-y-3">
                        {offerVariables.map((v, idx) => {
                          const tempVal = optionInputs[v.key] || '';
                          return (
                            <div key={v.key} className="border border-slate-200 rounded-lg p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                              {/* Drag / Reorder Buttons + Variable Info */}
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => moveUp(idx)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                    title="Move Up"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === offerVariables.length - 1}
                                    onClick={() => moveDown(idx)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                    title="Move Down"
                                  >
                                    ▼
                                  </button>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900">{v.label}</span>
                                    {v.auto === true ? (
                                      <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded">
                                        Auto
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-medium rounded">
                                        Manual
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-xs text-slate-400 block">{v.key}</span>
                                </div>
                              </div>

                              {/* Configuration: Print Switch & Type Selection */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-2">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`print-${v.key}`}
                                    checked={v.print === true}
                                    onCheckedChange={() => togglePrint(idx)}
                                  />
                                  <Label htmlFor={`print-${v.key}`} className="text-xs font-normal">
                                    Print on design
                                  </Label>
                                </div>

                                {v.auto === false && (
                                  <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs font-normal whitespace-nowrap">Input Type:</Label>
                                      <Select
                                        value={v.type}
                                        onValueChange={(val) => handleTypeChange(idx, val)}
                                      >
                                        <SelectTrigger className="h-8 w-[120px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="text">Text</SelectItem>
                                          <SelectItem value="number">Number</SelectItem>
                                          <SelectItem value="dropdown">Dropdown</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {v.type === 'dropdown' && (
                                      <div className="space-y-2 mt-1 w-full sm:w-64">
                                        <div className="flex gap-1.5">
                                          <Input
                                            type="text"
                                            placeholder="Add option..."
                                            value={tempVal}
                                            onChange={(e) =>
                                              setOptionInputs((prev) => ({ ...prev, [v.key]: e.target.value }))
                                            }
                                            className="h-7 text-xs flex-1"
                                          />
                                          <Button
                                            type="button"
                                            onClick={() => handleAddOption(idx, v.key)}
                                            className="h-7 px-2 text-xs bg-slate-800 text-white hover:bg-slate-900"
                                          >
                                            Add
                                          </Button>
                                        </div>
                                        {(v.options || []).length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {(v.options || []).map((opt) => (
                                              <span
                                                key={opt}
                                                className="inline-flex items-center gap-1 bg-slate-100 border text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                              >
                                                {opt}
                                                <button
                                                  type="button"
                                                  onClick={() => handleRemoveOption(idx, opt)}
                                                  className="text-slate-400 hover:text-slate-600 font-bold"
                                                >
                                                  ×
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Remove Button */}
                              <div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveVariable(v.key)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: Code & Template */}
              {formStep === 4 && (
                <div className="space-y-4">
                  {/* Coupon Code Structure — clickable placeholder builder */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="coupon_code_structure">Coupon Code Structure</Label>
                      <div className="relative group">
                        <Info className="w-4 h-4 text-slate-400 cursor-help" />
                        <div className="absolute left-6 top-0 z-10 hidden group-hover:block w-72 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl">
                          <p className="font-semibold mb-1">How coupon codes are built</p>
                          <p className="text-slate-300">Click the blocks below to build your code pattern. Each block represents a part of the final coupon code.</p>
                          <ul className="mt-2 space-y-1 text-slate-300">
                            <li><span className="font-mono text-blue-300">{"{PREFIX}"}</span> — Template prefix (e.g. BMW)</li>
                            <li><span className="font-mono text-green-300">{"{ADVISOR}"}</span> — Advisor's personal code</li>
                            <li><span className="font-mono text-amber-300">{"{SERIAL}"}</span> — Auto serial number</li>
                            <li><span className="font-mono text-purple-300">{"{IDENTIFIER}"}</span> — Plate or mobile number</li>
                          </ul>
                          <p className="mt-2 text-slate-400">Leave blank to use the default format.</p>
                        </div>
                      </div>
                    </div>
                    {/* Predefined Preset Option to set AUTOVERSA structure format */}
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, coupon_code_structure: 'AUTOVERSA_{ADVISOR}_{IDENTIFIER}' })}
                        className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors shadow-sm"
                      >
                        Apply Preset: {"AUTOVERSA Structure (AUTOVERSA_{ADVISOR}_{IDENTIFIER})"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {[
                        { label: '{PREFIX}', color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
                        { label: '{ADVISOR}', color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' },
                        { label: '{SERIAL}', color: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
                        { label: '{IDENTIFIER}', color: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200' },
                      ].map((block) => (
                        <button
                          key={block.label}
                          type="button"
                          onClick={() => {
                            const current = formData.coupon_code_structure || '';
                            const separator = current && !current.endsWith('_') ? '_' : '';
                            setFormData({ ...formData, coupon_code_structure: current + separator + block.label });
                          }}
                          className={`px-3 py-1 rounded-full border text-xs font-mono font-medium transition-colors ${block.color}`}
                        >
                          + {block.label}
                        </button>
                      ))}
                      {formData.coupon_code_structure && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, coupon_code_structure: '' })}
                          className="px-3 py-1 rounded-full border border-red-300 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <Input
                      id="coupon_code_structure"
                      type="text"
                      value={formData.coupon_code_structure || ''}
                      onChange={(e) => setFormData({ ...formData, coupon_code_structure: e.target.value })}
                      placeholder="Click blocks above or type manually e.g. {PREFIX}_{ADVISOR}_{SERIAL}_{IDENTIFIER}"
                      className="font-mono text-sm"
                    />
                    {formData.coupon_code_structure && (
                      <p className="text-xs text-slate-500">Preview: <span className="font-mono font-medium text-slate-700">{formData.coupon_code_structure}</span></p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="template">Linked Template (Optional)</Label>
                    <Select
                      value={formData.template_id ? String(formData.template_id) : ""}
                      onValueChange={(value) => setFormData({ ...formData, template_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Empty string value prevents React crash on radix-ui SelectItem */}
                        <SelectItem value="">No template</SelectItem>
                        {/* Safe mapping and string conversion for templates to prevent white-screen crashes */}
                        {(templates || []).map((template) => (
                          <SelectItem key={template.id} value={template?.id ? String(template.id) : ""}>
                            {template?.name} {template?.offer_id && template?.offer_id !== editingOffer?.id ? '(linked to another offer)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Link this offer to a specific coupon template</p>
                  </div>
                </div>
              )}

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-6 border-t mt-6">
                <div className="flex gap-3">
                  {formStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrevStep}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelEdit}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
                <div>
                  {formStep < 4 ? (
                    /* Next button with brand gold gradient style */
                    <Button
                      type="button"
                      onClick={handleNextStep}
                      className="text-white font-medium" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
                    >
                      Next
                    </Button>
                  ) : (
                    /* Submit/Save button with custom forest green gradient style */
                    <Button
                      type="submit"
                      className="text-white font-medium" style={{ background: 'linear-gradient(135deg, #1a7a4a, #0f5c37)' }}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {editingOffer ? 'Update' : 'Create'}
                    </Button>
                  )}
                </div>
              </div>

            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      {!isCreating && !editingOffer && offers.length > 0 && (
        /* Custom styled filter bar card with shadow-sm and light background color */
        <Card className="border-0 shadow-sm" style={{ background: '#F8F9FB' }}>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search offers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Select value={filterCustomerType} onValueChange={setFilterCustomerType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Customer Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    {/* Labels changed to hide customer type language - 2026-06-05 */}
                    <SelectItem value="NEW">Mobile Identifier</SelectItem>
                    <SelectItem value="EXISTING">Plate Identifier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active Only</SelectItem>
                    <SelectItem value="INACTIVE">Inactive Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          /* Custom styled loading state text */
          <div className="col-span-2 text-center py-12 text-slate-400 text-sm tracking-wide">Loading offers...</div>
        ) : filteredOffers.length === 0 ? (
          <div className="col-span-2 text-center py-12">
            {/* Custom styled gold empty state icon */}
            <Tag className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9A84C', opacity: 0.4 }} />
            {/* Custom styled empty state text */}
            <p className="text-slate-400 text-sm">
              {offers.length === 0 ? 'No offers yet. Create your first offer to get started.' : 'No offers match your filters.'}
            </p>
          </div>
        ) : (
          filteredOffers.map((offer) => (
            /* Custom styled Offer Card with subtle shadow, borderless design, and brand gold left border */
            <Card key={offer.id} className={`transition-all border-0 overflow-hidden ${
              !offer.is_active ? 'opacity-60' : ''
            }`} style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderLeft: '3px solid #C9A84C' }}>
              {/* Card content with 0 padding to contain the structured sub-sections */}
              <CardContent className="p-0">
                {/* Top inner wrapper with light grey background, padding, and bottom border */}
                <div className="px-5 pt-4 pb-2 border-b border-slate-100" style={{ background: '#FAFAFA' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {/* Offer title with tighter tracking and bold styling */}
                        <h3 className="font-bold text-slate-900 tracking-tight">{offer.title}</h3>
                        {/* Customer status display badges removed per change request 2026-06-05 */}
                        {offer.is_active ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">
                            Inactive
                          </span>
                        )}
                      </div>
                      {offer.description && (
                        <p className="text-sm text-slate-600 mb-2">{offer.description}</p>
                      )}
                      {/* Validity text styled with customized slate-400 and slate-600 colors */}
                      <div className="text-xs text-slate-400 mb-2">
                        <p>Validity: <span className="font-semibold text-slate-600">{offer.valid_days || 30} days</span></p>
                      </div>
                    </div>
                    {/* Action buttons (Edit & Delete) with customized states */}
                    <div className="flex gap-1 ml-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(offer)}
                        disabled={editingOffer?.id === offer.id}
                        className="text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${offer.title}"?`)) {
                            deleteMutation.mutate(offer.id);
                          }
                        }}
                        className="text-slate-300 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Inline template management section, rendered below in a separate container with custom background */}
                {(() => {
                  const linkedTemplate = templates.find(t => t.offer_id === offer.id);
                  if (linkedTemplate) {
                    // Render template details and management controls if a template is linked to this offer
                    // Change 3: Added horizontal padding and bottom padding to template section with linked template
                    return (
                      <div className="mt-3 pt-3 px-5 border-t border-slate-100 bg-slate-50/50 space-y-2 pb-4">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-700">{linkedTemplate.name}</span>
                          {linkedTemplate.is_default === true && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              Default
                            </span>
                          )}
                          {linkedTemplate.is_active === true ? (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full font-medium">Inactive</span>
                          )}
                          {linkedTemplate.coupon_code_prefix && (
                            <span className="text-xs text-slate-500 font-mono">Prefix: {linkedTemplate.coupon_code_prefix}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {/* Open coordinates mapper for editing variable placement */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMappingTemplate(linkedTemplate)}
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Edit Variable Positions
                          </Button>
                          {/* Option to set this template as default if it isn't already */}
                          {linkedTemplate.is_default !== true && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTemplateAsDefault(linkedTemplate)}
                            >
                              <Star className="w-3 h-3 mr-1" />
                              Set Default
                            </Button>
                          )}
                          {/* View full size template image */}
                          <a href={linkedTemplate.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              View Image
                            </Button>
                          </a>
                          {/* Trigger mutation to delete template */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (confirm('Delete template "' + linkedTemplate.name + '"?')) {
                                templateDeleteMutation.mutate(linkedTemplate.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  } else {
                    // Render upload button if no template is currently linked to the offer
                    // Change 4: Added horizontal padding and bottom padding to template section without linked template
                    return (
                      <div className="mt-3 pt-3 px-5 pb-4 border-t border-slate-100 bg-slate-50/50">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => {
                            setIsUploadingTemplate(true);
                            setUploadingForOfferId(offer.id);
                          }}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Upload Template
                        </Button>
                      </div>
                    );
                  }
                })()}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}