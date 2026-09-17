window.RealPPTToPDF = {
  async convert(file, onProgress) {
    if (!window.JSZip) throw new Error("JSZip library failed to load.");
    
    const { PDFDocument, rgb, StandardFonts } = await window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(file);
    
    // Find all slide XML files inside the PPTX package
    const slideFiles = Object.keys(zipContent.files).filter(k => k.match(/^ppt\/slides\/slide\d+\.xml$/));
    
    if (slideFiles.length === 0) {
      throw new Error("No slides found or invalid PPTX format.");
    }
    
    // Sort slides numerically so they appear in correct order
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

    for (let i = 0; i < slideFiles.length; i++) {
      if (onProgress) onProgress(((i + 1) / slideFiles.length) * 100);
      
      const slideXml = await zipContent.file(slideFiles[i]).async("string");
      
      // Extract raw text from PPTX XML nodes (<a:t> tags)
      const textNodes = slideXml.match(/<a:t>.*?<\/a:t>/g) || [];
      const slideText = textNodes.map(t => t.replace(/<a:t>/, '').replace(/<\/a:t>/, '')).join('\n');
      
      const page = doc.addPage([841.89, 595.28]); // A4 Landscape for slides
      page.drawText(`Slide ${i + 1}`, { x: 40, y: 540, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
      
      let y = 500;
      const lines = slideText.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        if (y < 40) break; // Simple truncation to prevent overflow
        page.drawText(line.substring(0, 110), { x: 40, y: y, size: 12, font: font, color: rgb(0.2, 0.2, 0.2) });
        y -= 18;
      }
    }
    
    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }
};
