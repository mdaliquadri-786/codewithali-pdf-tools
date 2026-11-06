window.RealSecurityEngine = {
  _loadingPromise: null,

  hasEncryptionSupport() {
    // Stock pdf-lib has no encrypt(); only the @cantoo/pdf-lib fork does.
    return !!(window.PDFLib && window.PDFLib.PDFDocument &&
              typeof window.PDFLib.PDFDocument.prototype.encrypt === 'function');
  },

  async ensureEncryptionLibrary() {
    if (this.hasEncryptionSupport()) return true;
    if (this._loadingPromise) return this._loadingPromise;

    this._loadingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js';
      s.onload = () => {
        if (this.hasEncryptionSupport()) {
          resolve(true);
        } else {
          // Fallback check if it attached under another global
          resolve(false);
        }
      };
      s.onerror = () => reject(new Error('Could not load the AES encryption engine (@cantoo/pdf-lib). Please check your internet connection.'));
      document.head.appendChild(s);
    });

    return this._loadingPromise;
  },

  async protect(file, password) {
    if (!password || password.trim() === '') {
      throw new Error('Please enter a valid password to encrypt the PDF.');
    }

    await this.ensureEncryptionLibrary();

    if (!this.hasEncryptionSupport()) {
      throw new Error('Real password encryption requires the @cantoo/pdf-lib engine, which failed to initialize. Check your internet connection, reload the page, and try again.');
    }

    const { PDFDocument } = window.PDFLib;
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    // Genuine AES-256 encryption
    doc.encrypt({
      userPassword: password,
      ownerPassword: password + '_admin',
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

  async unlock(file, password = '') {
    await this.ensureEncryptionLibrary();

    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) {
      throw new Error('PDF library is still loading. Please reload the page and try again.');
    }

    const buffer = await file.arrayBuffer();

    try {
      let doc;
      if (password && password.trim().length > 0) {
        // Attempt decryption with supplied password
        doc = await PDFDocument.load(buffer, { password: password.trim() });
      } else {
        // Attempt load ignoring restrictions (for permission-locked documents)
        doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      }

      // Rebuild into a clean, unencrypted PDFDocument
      const clean = await PDFDocument.create();
      const pages = await clean.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => clean.addPage(p));
      const bytes = await clean.save();
      return new Blob([bytes], { type: 'application/pdf' });
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('password') || msg.includes('encrypt') || msg.includes('decrypt')) {
        if (!password || password.trim().length === 0) {
          throw new Error('This document is password-encrypted. Please enter the password to decrypt it.');
        } else {
          throw new Error('Incorrect password! Failed to decrypt the document.');
        }
      }
      throw e;
    }
  }
};
