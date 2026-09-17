document.addEventListener('DOMContentLoaded', () => {
    // 0. GLOBAL UI BUG FIX: Fix the broken download button ID
    const dlBtn = document.getElementById('downloadBtn');
    if (dlBtn) {
        dlBtn.id = 'downloadResultBtn';
    }

    // 1. INJECT CSS FIX: Stop long file names from overlapping cards
    const style = document.createElement('style');
    style.innerHTML = `
        .files-container {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important;
            gap: 12px !important;
            width: 100% !important;
        }
        .file-card { min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; }
        .file-card-info { min-width: 0 !important; overflow: hidden !important; }
        .file-card-info strong {
            display: block !important; width: 100% !important;
            white-space: nowrap !important; overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
    `;
    document.head.appendChild(style);

    // 2. WIDEN ACCEPTED FILES dynamically
    if (window.TOOLS) {
        if (TOOLS['word-to-pdf']) TOOLS['word-to-pdf'].accept = '.doc,.docx,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (TOOLS['excel-to-pdf']) TOOLS['excel-to-pdf'].accept = '.xlsx,.xls,.csv';
        if (TOOLS['pdf-to-ppt']) TOOLS['pdf-to-ppt'].accept = '.pdf,application/pdf';
        if (TOOLS['ppt-to-pdf']) TOOLS['ppt-to-pdf'].accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }

    // 3. IMAGE TO PDF CRASH FIX (Progressive JPEG / Canvas Fix)
    if (typeof Engine1_PDFLib !== 'undefined') {
        Engine1_PDFLib.imageToPDF = async function(files) {
            const { PDFDocument } = await this.ensureLibrary();
            const pdfDoc = await PDFDocument.create();

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const imgBitmap = await new Promise((resolve, reject) => {
                    const img = new Image();
                    const url = URL.createObjectURL(file);
                    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load image: ${file.name}`)); };
                    img.src = url;
                });

                const canvas = document.createElement('canvas');
                canvas.width = imgBitmap.naturalWidth || imgBitmap.width;
                canvas.height = imgBitmap.naturalHeight || imgBitmap.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgBitmap, 0, 0);

                const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                canvas.width = 0; canvas.height = 0;

                const embeddedImage = await pdfDoc.embedJpg(jpgDataUrl);
                const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
                page.drawImage(embeddedImage, { x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height });
            }

            const bytes = await pdfDoc.save();
            return new Blob([bytes], { type: 'application/pdf' });
        };
    }

    // --- HELPER: Extract Text directly using pdf.js ---
    async function extractTextFromPDF(file) {
        if (!window.pdfjsLib) throw new Error("PDF.js library not found for text extraction.");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    }

    // 4. SAFE OVERRIDE: Wire up Genuine Tools + AI Summarize + Extract Text
    setTimeout(() => {
        const actionBtn = document.getElementById('actionSubmitBtn');
        if (actionBtn) {
            const originalOnClick = actionBtn.onclick;

            actionBtn.onclick = async (e) => {
                const urlParams = new URLSearchParams(window.location.search);
                const pathMatch = window.location.pathname.match(/\/tools\/([a-z0-9-]+)/i);
                const toolKey = urlParams.get('tool') || (pathMatch ? pathMatch[1] : null);

                const newGenuineTools = [
                    'ocr', 'word-to-pdf', 'excel-to-pdf', 'pdf-to-ppt', 
                    'ppt-to-pdf', 'protect', 'unlock', 'pdf-to-pdfa',
                    'ai-summarize', 'extract-text'
                ];

                if (!newGenuineTools.includes(toolKey)) {
                    if (originalOnClick) return originalOnClick.call(actionBtn, e);
                    return;
                }

                e.preventDefault();
                const fileInput = document.getElementById('fileInput');
                if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                    alert('Please select a file first.');
                    return;
                }

                const file = fileInput.files[0];
                document.getElementById('processingOverlay').style.display = 'flex';
                document.getElementById('progressBarInner').style.width = '20%';
                
                const pctText = document.getElementById('progressPercentage');
                if(pctText) pctText.innerText = 'Processing...';

                try {
                    let resultBlob = null;
                    let downloadFilename = 'output.pdf';

                    // --- NEW GENUINE TOOLS ---
                    if (toolKey === 'word-to-pdf' && window.RealWordToPDF) {
                        resultBlob = await window.RealWordToPDF.convert(file);
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
                    }
                    else if (toolKey === 'excel-to-pdf' && window.RealExcelToPDF) {
                        resultBlob = await window.RealExcelToPDF.convert(file);
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
                    }
                    else if (toolKey === 'ocr' && window.RealOCREngine) {
                        const res = await window.RealOCREngine.ocrPdfFile(file, {
                            buildSearchablePdf: true,
                            onProgress: (p) => {
                                if(pctText) pctText.innerText = Math.round(p) + '%';
                                document.getElementById('progressBarInner').style.width = `${Math.round(p)}%`;
                            }
                        });
                        resultBlob = res.searchablePdfBlob;
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_OCR.pdf`;
                    }
                    else if (toolKey === 'pdf-to-ppt' && window.RealPDFToPPT) {
                        resultBlob = await window.RealPDFToPPT.convert(file, (p) => {
                            if(pctText) pctText.innerText = Math.round(p) + '%';
                            document.getElementById('progressBarInner').style.width = `${Math.round(p)}%`;
                        });
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Slides.pptx`;
                    }
                    else if (toolKey === 'ppt-to-pdf' && window.RealPPTToPDF) {
                        resultBlob = await window.RealPPTToPDF.convert(file, (p) => {
                            if(pctText) pctText.innerText = Math.round(p) + '%';
                            document.getElementById('progressBarInner').style.width = `${Math.round(p)}%`;
                        });
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
                    }
                    else if (toolKey === 'protect' && window.RealSecurityEngine) {
                        const pass = document.getElementById('pdfPass')?.value;
                        resultBlob = await window.RealSecurityEngine.protect(file, pass);
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Protected.pdf`;
                    }
                    else if (toolKey === 'unlock' && window.RealSecurityEngine) {
                        const pass = prompt("Enter the password to decrypt this PDF:");
                        if (!pass) throw new Error("Operation cancelled. Password is required to unlock.");
                        resultBlob = await window.RealSecurityEngine.unlock(file, pass);
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Unlocked.pdf`;
                    }
                    else if (toolKey === 'pdf-to-pdfa' && window.RealPDFAEngine) {
                        resultBlob = await window.RealPDFAEngine.convert(file);
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_PDFA.pdf`;
                    }
                    
                    // --- SMART AI SUMMARIZE (Gemini 1.5 Flash) ---
                    else if (toolKey === 'ai-summarize') {
                        // Hardcoded API Key from your Google AI Studio
                        const apiKey = "AQ.Ab8RN6I-kYxExRTPEP324aw2CCCvDauHJqK-B-fI6h2P09nHqQ";

                        const base64PDF = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result;
                                const base64 = result.split(',')[1];
                                resolve(base64);
                            };
                            reader.onerror = () => reject(new Error("Failed to read PDF file."));
                            reader.readAsDataURL(file);
                        });

                        const mode = document.querySelector('input[name="aiSummaryMode"]:checked')?.value || 'executive';
                        const promptText = mode === 'deep' 
                            ? "Provide a comprehensive, in-depth summary of this document. Extract all major themes, key arguments, and important data points. If the document is in Arabic or Urdu, you MUST reply in that exact same language with perfect, natural grammar."
                            : "Provide a concise executive summary of this document in 5 to 7 bullet points. Highlight only the most critical information. If the document is in Arabic or Urdu, you MUST reply in that exact same language with perfect grammar.";

                        const payload = {
                            contents: [{
                                parts: [
                                    { inlineData: { mimeType: "application/pdf", data: base64PDF } },
                                    { text: promptText }
                                ]
                            }]
                        };

                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        const data = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(data.error?.message || "AI API Error.");
                        }

                        const aiText = data.candidates[0].content.parts[0].text;
                        const aiContent = `=== SMART AI SUMMARY ===\nFile: ${file.name}\n\n${aiText}`;
                        
                        resultBlob = new Blob(['\ufeff', aiContent], { type: 'text/plain;charset=utf-8' });
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Smart_Summary.txt`;
                        
                        const qnaBox = document.getElementById('aiQnaBox');
                        const qnaResults = document.getElementById('aiQnaResults');
                        if (qnaBox && qnaResults) {
                            qnaBox.style.display = 'block';
                            qnaResults.dir = "auto"; 
                            qnaResults.innerHTML = `<div style="padding: 15px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; color: var(--text-primary); text-align: start; direction: auto;">${aiContent}</div>`;
                        }
                    }

                    // --- EXTRACT TEXT ---
                    else if (toolKey === 'extract-text') {
                        const fullText = await extractTextFromPDF(file);
                        if (fullText.trim().length === 0) {
                            throw new Error("No text found. If this is a scanned document, please run it through the 'OCR PDF' tool first.");
                        }
                        resultBlob = new Blob(['\ufeff', fullText], { type: 'text/plain;charset=utf-8' });
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Extracted_Text.txt`;
                        
                        const extBox = document.getElementById('extractedTextBox');
                        const extContent = document.getElementById('extractedTextContent');
                        if (extBox && extContent) {
                            extBox.style.display = 'block';
                            extContent.value = fullText;
                        }
                    }

                    if (!resultBlob) throw new Error("Conversion failed. No output generated.");

                    document.getElementById('progressBarInner').style.width = '100%';
                    if(pctText) pctText.innerText = '100%';

                    const url = window.URL.createObjectURL(resultBlob);
                    document.getElementById('processingOverlay').style.display = 'none';
                    document.getElementById('workspaceBody').style.display = 'none';
                    document.getElementById('resultCard').style.display = 'block';
                    
                    const dBtn = document.getElementById('downloadResultBtn') || document.getElementById('downloadBtn');
                    if (dBtn) {
                        dBtn.href = url;
                        dBtn.download = downloadFilename;
                    }

                } catch (err) {
                    document.getElementById('processingOverlay').style.display = 'none';
                    alert('Error: ' + err.message);
                    console.error(err);
                }
            };
        }
    }, 500); 
});
