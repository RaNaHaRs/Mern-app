/**
 * Export API Service - CSV Download (Excel Compatible)
 */

export const exportApi = {
  /**
   * Export cases to CSV
   */
  exportCases: async (filters = {}) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('crm_token');
      const response = await fetch('/api/export/cases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filters })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Export failed: ${response.status} ${errText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Export cases error:', error);
      throw error;
    }
  },

  /**
   * Export clients to CSV
   */
  exportClients: async (filters = {}) => {
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('crm_token');
      const response = await fetch('/api/export/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filters })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Export failed: ${response.status} ${errText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Export clients error:', error);
      throw error;
    }
  },

  /**
   * Download blob as file
   */
  downloadFile: (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
};

export default exportApi;
