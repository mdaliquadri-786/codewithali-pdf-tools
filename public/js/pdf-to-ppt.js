window.RealPDFToPPT = {
  async convert(file, onProgress) {
    if (!window.PptxGenJS) throw new Error("PptxGenJS library failed to load.");
    
    const pptx = new PptxGenJS();
    const buffer = await file.arrayBuffer();
    const pdfjsLib = window.pdfjsLib;
    
    // Load PDF
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    
    for (let i = 1; i <= pdf.numPages; i++) {
      if (onProgress) onProgress((i / pdf.numPages) * 100);
      
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // High DPI for crisp slides
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      
      // Add slide and set PDF page as full background
      const slide = pptx.addSlide();
      slide.background = { data: imgData };
      
      // Memory cleanup
      canvas.width = 0;
      canvas.height = 0;
    }
    
    const blob = await pptx.write({ outputType: 'blob' });
    return blob;
  }
};
