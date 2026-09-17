// --- SMART AI SUMMARIZE (Gemini 1.5 Flash) ---
                    else if (toolKey === 'ai-summarize') {
                        // 1. Get API Key (Stored locally in browser so you don't expose it in public code)
                        let apiKey = localStorage.getItem('cwa_gemini_key');
                        if (!apiKey) {
                            apiKey = prompt("To read 250+ page PDFs and perfect Arabic/Urdu, this tool uses Gemini 1.5 AI.\n\nEnter your FREE Google Gemini API Key:");
                            if (!apiKey) throw new Error("API Key is required for Smart AI Summarization.");
                            localStorage.setItem('cwa_gemini_key', apiKey.trim());
                        }

                        // 2. Convert PDF to Base64 to send directly to the AI
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

                        // 3. Build the prompt
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

                        // 4. Call Google Gemini API
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        const data = await response.json();
                        
                        if (!response.ok) {
                            if (data.error && data.error.message.includes("API key not valid")) {
                                localStorage.removeItem('cwa_gemini_key'); // clear bad key
                            }
                            throw new Error(data.error?.message || "AI API Error.");
                        }

                        // 5. Parse and display result
                        const aiText = data.candidates[0].content.parts[0].text;
                        const aiContent = `=== SMART AI SUMMARY (Gemini 1.5 Flash) ===\nFile: ${file.name}\n\n${aiText}`;
                        
                        resultBlob = new Blob(['\ufeff', aiContent], { type: 'text/plain;charset=utf-8' });
                        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Smart_Summary.txt`;
                        
                        const qnaBox = document.getElementById('aiQnaBox');
                        const qnaResults = document.getElementById('aiQnaResults');
                        if (qnaBox && qnaResults) {
                            qnaBox.style.display = 'block';
                            qnaResults.dir = "auto"; // Automatically detects RTL for Arabic/Urdu
                            qnaResults.innerHTML = `<div style="padding: 15px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; color: var(--text-primary); text-align: start; direction: auto;">${aiContent}</div>`;
                        }
                    }
