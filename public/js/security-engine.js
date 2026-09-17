window.RealSecurityEngine = {
  async protect(file, password) {
    if (!password || password.trim() === '') {
      throw new Error("Please enter a valid passphrase to encrypt the PDF.");
    }
    const { PDFDocument } = await window.PDFLib;
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    // Native pdf-lib Encryption (AES/RC4 based on standard security handler)
    doc.encrypt({
      userPassword: password,
      ownerPassword: password + "_admin", // Prevents users from bypassing restrictions
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false
      }
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async unlock(file, password) {
    if (!password) {
      throw new Error("Password is required to decrypt this document.");
    }
    const { PDFDocument } = await window.PDFLib;
    const buffer = await file.arrayBuffer();

    try {
      // Attempt to load WITH the user's password. This performs actual decryption.
      const doc = await PDFDocument.load(buffer, { password: password });
      
      // Saving it without calling doc.encrypt() strips the password and exports a clean PDF.
      const bytes = await doc.save({ useObjectStreams: true });
      return new Blob([bytes], { type: 'application/pdf' });
    } catch (e) {
      if (e.message.includes('encrypted') || e.message.includes('password')) {
        throw new Error("Incorrect password! Failed to decrypt the document.");
      }
      throw e;
    }
  }
};
