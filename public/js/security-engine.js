window.RealSecurityEngine = {
  hasEncryptionSupport() {
    // Stock pdf-lib has no encrypt(); only the @cantoo/pdf-lib fork does.
    return !!(window.PDFLib && window.PDFLib.PDFDocument &&
              typeof window.PDFLib.PDFDocument.prototype.encrypt === 'function');
  },

  async protect(file, password) {
    if (!password || password.trim() === '') {
      throw new Error("Please enter a valid passphrase to encrypt the PDF.");
    }
    if (!this.hasEncryptionSupport()) {
      throw new Error("Real password encryption requires the @cantoo/pdf-lib engine, which has not loaded yet. Check your internet connection, reload the page, and try again.");
    }
    const { PDFDocument } = window.PDFLib;
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    // Real AES encryption (AES-256 by default in the fork)
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
    if (!this.hasEncryptionSupport()) {
      throw new Error("Real password decryption requires the @cantoo/pdf-lib engine, which has not loaded yet. Check your internet connection, reload the page, and try again.");
    }
    const { PDFDocument } = window.PDFLib;
    const buffer = await file.arrayBuffer();

    try {
      // Attempt to load WITH the user's password. This performs actual decryption.
      const doc = await PDFDocument.load(buffer, { password: password });

      // BUG FIX: simply re-saving the loaded document (even without calling
      // doc.encrypt() again) left a dangling /Encrypt reference in the
      // output's trailer pointing at the original encryption dictionary
      // object — confirmed via an independent Python (pypdf) parser reading
      // the raw trailer. pypdf's own is_encrypted flag still correctly read
      // false and content was still readable either way, so this was
      // cosmetic rather than a functional or security problem, but a fully
      // clean file is better than one carrying stale encryption metadata.
      // Rebuilding into a brand-new PDFDocument and copying pages over
      // produces a genuinely clean file with no trace of the old /Encrypt
      // entry at all (verified: zero occurrences of "/Encrypt" in the
      // output bytes, not just a semantic is_encrypted=false).
      const clean = await PDFDocument.create();
      const pages = await clean.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => clean.addPage(p));
      const bytes = await clean.save();
      return new Blob([bytes], { type: 'application/pdf' });
    } catch (e) {
      if ((e.message || '').toLowerCase().includes('password') || (e.message || '').toLowerCase().includes('encrypt')) {
        throw new Error("Incorrect password! Failed to decrypt the document.");
      }
      throw e;
    }
  }
};
