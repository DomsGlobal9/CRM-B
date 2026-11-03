import { useState } from 'react';
import { amountError } from '../../services/validate';
import { api } from '../../services/api';

/**
 * The Designs page's own state: the add or edit form and its photo, saving and
 * deleting a design, and the upload panel. The library reloads through
 * designLibraryToken after a change.
 */
export default function useDesignManager({ fetchDashboardAndConfig }) {
  const [designLibraryToken, setDesignLibraryToken] = useState(0);

  // Designs CRUD State
  const [showDesignModal, setShowDesignModal] = useState(false);

  const [editingDesign, setEditingDesign] = useState(null);

  const [designSaving, setDesignSaving] = useState(false);

  const [designImageFile, setDesignImageFile] = useState(null);

  const [showDesignUpload, setShowDesignUpload] = useState(false);

  const [designForm, setDesignForm] = useState({
    name: '',
    garment_type: 'Lehenga',
    neckline_style: '',
    sleeve_style: '',
    image_url: '',
    is_boutique: true,
    price: 0,
    description: ''
  });

  const handleSaveDesign = async (e) => {
    e.preventDefault();
    if (designSaving) return;
    const imageUrl = (designForm.image_url || '').trim();
    const bad = amountError(designForm.price, { label: 'Catalog price' })
      
      || (imageUrl && ((/^[a-z][a-z0-9+.-]*:/i.test(imageUrl) && !/^https?:/i.test(imageUrl)) || /\s/.test(imageUrl))
        ? 'The image URL must be a web address (http:// or https://) or a catalogue file name.' : '');
    if (bad) { alert(bad); return; }
    setDesignSaving(true);
    try {
      const payload = {
        ...designForm,
        image_url: imageUrl,
        price: parseFloat(designForm.price) || 0.00,
        is_boutique: designForm.is_boutique === true || designForm.is_boutique === 'true',
        
        catalogue: designForm.catalogue_path || undefined,
      };
      delete payload.catalogue_path;
      if (designImageFile) {
        
        payload.image_url = (await api.uploadBoutiqueDesignImage(designImageFile)).image_url;
      }
      if (!payload.image_url) {
        
        payload.image_url = 'https://images.unsplash.com/photo-1610030469668-93535c17b6b3?w=400';
      }
      if (editingDesign) {
        await api.updateBoutiqueDesign(editingDesign.id, payload);
      } else {
        await api.createBoutiqueDesign(payload);
      }
      setShowDesignModal(false);
      setEditingDesign(null);
      setDesignImageFile(null);
      setDesignForm({ name: '', garment_type: 'Lehenga', neckline_style: '', sleeve_style: '', image_url: '', is_boutique: true, price: 0, description: '' });
      setDesignLibraryToken(t => t + 1);
      fetchDashboardAndConfig();
    } catch (err) {
      alert("Failed to save design: " + err.message);
    } finally {
      setDesignSaving(false);
    }
  };

  const handleDeleteDesign = async (id) => {
    if (window.confirm("Are you sure you want to delete this design?")) {
      try {
        await api.deleteBoutiqueDesign(id);
        setDesignLibraryToken(t => t + 1);
        fetchDashboardAndConfig();
      } catch (err) {
        alert("Failed to delete design: " + err.message);
      }
    }
  };

  return {
    designLibraryToken,
    setDesignLibraryToken,
    showDesignModal,
    setShowDesignModal,
    editingDesign,
    setEditingDesign,
    designSaving,
    setDesignSaving,
    designImageFile,
    setDesignImageFile,
    showDesignUpload,
    setShowDesignUpload,
    designForm,
    setDesignForm,
    handleSaveDesign,
    handleDeleteDesign,
  };
}
