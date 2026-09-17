window.RealPDFAEngine = {
  async convert(file) {
    const { PDFDocument } = await window.PDFLib;
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    // Inject Archival Metadata Properties
    doc.setTitle(`[Archived] ${file.name}`);
    doc.setAuthor("CodeWithAli PDF Tools");
    doc.setCreator("CodeWithAli Archival Engine");
    doc.setProducer("pdf-lib Standardized Exporter");

    const bytes = await doc.save({ 
        useObjectStreams: true 
    });
    return new Blob([bytes], { type: 'application/pdf' });
  }
};
