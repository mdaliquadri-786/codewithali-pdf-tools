/**
 * CodeWithAli PDF Suite - Frontend Event Controller v11.0 (Production Optimized)
 * Drag & Drop, UI Rendering, and Smart Crash Protection Safeguards
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const processBtn = document.getElementById('process-btn');
    const loadingSpinner = document.querySelector('.loading-spinner');
    
    let selectedFiles = [];

    // Configuration Limits (Crash Protection)
    const MAX_FILE_SIZE_MB = 100; // 100MB limit per file
    const MAX_TOTAL_FILES = 50;   // Max files for merge/process

    // =========================================================================
    // 1. UI FEEDBACK & EVENT LISTENERS
    // =========================================================================

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-active');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            handleFilesSelect(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            handleFilesSelect(e.target.files);
        });
    }

    // =========================================================================
    // 2. SMART CRASH PROTECTION & FILE SELECTION
    // =========================================================================

    function handleFilesSelect(files) {
        if (!files || files.length === 0) return;

        // Total files limit check
        if (selectedFiles.length + files.length > MAX_TOTAL_FILES) {
            showToast(`Limit Exceeded: You can only select up to ${MAX_TOTAL_FILES} files at a time.`, 'error');
            return;
        }

        const validFiles = [];
        
        for (let file of files) {
            // Memory check: Prevent browser crash from massive files
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > MAX_FILE_SIZE_MB) {
                showToast(`File too large: "${file.name}" is ${fileSizeMB.toFixed(1)}MB. Max limit is ${MAX_FILE_SIZE_MB}MB.`, 'error');
                continue;
            }

            // Mime type check (Allow PDF, Images, Word, PPT based on tool context)
            const allowedTypes = [
                'application/pdf', 
                'image/jpeg', 'image/png', 'image/webp',
                'application/msword', 
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'text/plain', 'text/markdown'
            ];

            if (allowedTypes.includes(file.type) || file.name.match(/\.(pdf|jpg|jpeg|png|webp|doc|docx|ppt|pptx|txt|md)$/i)) {
                validFiles.push(file);
            } else {
                showToast(`Unsupported format: "${file.name}". Please check the required file type for this tool.`, 'error');
            }
        }

        selectedFiles = [...selectedFiles, ...validFiles];
        renderFileList();
        updateProcessButtonState();
    }

    // =========================================================================
    // 3. RENDER FILE LIST & DRAG-TO-REORDER (FOR MERGE)
    // =========================================================================

    function renderFileList() {
        if (!fileList) return;
        
        fileList.innerHTML = '';
        
        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            // Add draggable attribute for ordering (Merge tool specific)
            li.draggable = true; 
            li.dataset.index = index;

            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.innerHTML = file.type.includes('image') ? '🖼️' : '📄';

            const details = document.createElement('div');
            details.className = 'file-details';
            
            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = file.name;
            
            const size = document.createElement('div');
            size.className = 'file-size';
            size.textContent = (file.size / 1024).toFixed(1) + ' KB';
            
            details.appendChild(name);
            details.appendChild(size);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '✖';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeFile(index);
            };

            li.appendChild(icon);
            li.appendChild(details);
            li.appendChild(removeBtn);
            
            // Drag and Drop ordering logic
            setupDragAndDropReorder(li);
            fileList.appendChild(li);
        });
    }

    function removeFile(index) {
        selectedFiles.splice(index, 1);
        renderFileList();
        updateProcessButtonState();
    }

    function updateProcessButtonState() {
        if (!processBtn) return;
        
        // Tool-specific requirements
        const path = window.location.pathname;
        const isMergeOrImageToPdf = path.includes('/merge') || path.includes('/image-to-pdf');
        
        if (isMergeOrImageToPdf) {
            processBtn.disabled = selectedFiles.length < 2; // Need at least 2 files
        } else {
            processBtn.disabled = selectedFiles.length === 0;
        }
    }

    // =========================================================================
    // 4. DRAG-AND-DROP REORDER LOGIC (FOR MERGE TOOL)
    // =========================================================================
    
    let dragStartIndex;

    function setupDragAndDropReorder(item) {
        item.addEventListener('dragstart', (e) => {
            dragStartIndex = +e.target.closest('.file-item').dataset.index;
            e.target.classList.add('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const dragEndIndex = +e.target.closest('.file-item').dataset.index;
            swapFiles(dragStartIndex, dragEndIndex);
        });

        item.addEventListener('dragend', (e) => {
            e.target.classList.remove('dragging');
        });
    }

    function swapFiles(fromIndex, toIndex) {
        const temp = selectedFiles[fromIndex];
        selectedFiles[fromIndex] = selectedFiles[toIndex];
        selectedFiles[toIndex] = temp;
        renderFileList();
    }

    // =========================================================================
    // 5. TOAST NOTIFICATION SYSTEM
    // =========================================================================
    
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 6px;
            background: ${type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            font-family: sans-serif;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            transition: opacity 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // =========================================================================
    // 6. TOOL EXECUTION ROUTING
    // =========================================================================

    if (processBtn) {
        processBtn.addEventListener('click', async () => {
            if (selectedFiles.length === 0) return;

            // Show UI Spinner
            if (loadingSpinner) loadingSpinner.style.display = 'block';
            processBtn.disabled = true;

            const urlPath = window.location.pathname;
            const engine = window.ClientPDFEngine;
            let response;

            try {
                if (urlPath.includes('/merge')) {
                    response = await engine.mergePDFs(selectedFiles);
                } 
                else if (urlPath.includes('/split')) {
                    // Collect options from DOM if they exist, fallback to default
                    const mode = document.querySelector('input[name="split-mode"]:checked')?.value || 'range';
                    const rangeStr = document.getElementById('split-range')?.value || '1';
                    response = await engine.splitPDF(selectedFiles[0], mode, rangeStr);
                }
                else if (urlPath.includes('/compress')) {
                    response = await engine.compressPDF(selectedFiles[0]);
                }
                else if (urlPath.includes('/rotate')) {
                    const angle = document.getElementById('rotate-angle')?.value || 90;
                    response = await engine.rotatePDF(selectedFiles[0], angle);
                }
                else if (urlPath.includes('/watermark')) {
                    const text = document.getElementById('watermark-text')?.value || 'Confidential';
                    const options = {
                        opacity: document.getElementById('opacity')?.value || 0.3,
                        fontSize: document.getElementById('font-size')?.value || 44,
                        position: document.getElementById('position')?.value || 'diagonal'
                    };
                    response = await engine.addWatermark(selectedFiles[0], text, options);
                }
                else if (urlPath.includes('/page-numbers')) {
                    response = await engine.addPageNumbers(selectedFiles[0]);
                }
                else if (urlPath.includes('/protect')) {
                    const pwd = document.getElementById('pdf-password')?.value || '';
                    response = await engine.protectPDF(selectedFiles[0], pwd);
                }
                else if (urlPath.includes('/unlock')) {
                    response = await engine.unlockPDF(selectedFiles[0]);
                }
                else if (urlPath.includes('/pdf-to-word')) {
                    response = await engine.pdfToWord(selectedFiles[0]);
                }
                else if (urlPath.includes('/ocr')) {
                    response = await engine.ocrPDF(selectedFiles[0]);
                }
                else if (urlPath.includes('/image-to-pdf')) {
                    response = await engine.imageToPDF(selectedFiles);
                }
                else if (urlPath.includes('/pdf-to-jpg')) {
                    response = await engine.pdfToJpg(selectedFiles[0]);
                }
                else if (urlPath.includes('/extract-text')) {
                    response = await engine.extractText(selectedFiles[0]);
                }
                else {
                    // Fallback generic processor for basic tools
                    const toolName = urlPath.split('/').filter(Boolean).pop();
                    response = await engine.genericProcess(selectedFiles[0], toolName);
                }

                // Handle Success Download
                if (response && response.success) {
                    const a = document.createElement('a');
                    a.href = response.downloadUrl;
                    a.download = response.filename;
                    a.click();
                    
                    showToast(response.message || 'Processing Complete!', 'info');
                    
                    // Memory Cleanup for Blob URL
                    if (response.isBlobUrl) {
                        setTimeout(() => URL.revokeObjectURL(response.downloadUrl), 1000);
                    }
                }
            } catch (err) {
                console.error("Processing Error:", err);
                showToast(err.message || 'An error occurred during processing.', 'error');
            } finally {
                // Restore UI State
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                updateProcessButtonState();
            }
        });
    }
});
