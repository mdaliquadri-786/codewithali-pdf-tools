from flask import Flask, request, send_file, jsonify
from pdf2docx import Converter
import tempfile
import os

app = Flask(__name__)

@app.route('/api/pdf-to-word', methods=['POST'])
def pdf_to_word():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty file"}), 400

    # Create temporary secure files for Vercel Serverless environment
    fd_pdf, temp_pdf = tempfile.mkstemp(suffix='.pdf')
    fd_docx, temp_docx = tempfile.mkstemp(suffix='.docx')
    
    try:
        # Save uploaded PDF to temp storage
        file.save(temp_pdf)
        
        # Convert PDF to Word using the powerful pdf2docx engine
        cv = Converter(temp_pdf)
        cv.convert(temp_docx, start=0, end=None)
        cv.close()
        
        return send_file(
            temp_docx,
            as_attachment=True,
            download_name=file.filename.replace('.pdf', '.docx').replace('.PDF', '.docx'),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    except Exception as e:
        return jsonify({"error": f"Conversion failed: {str(e)}"}), 500
    finally:
        # Clean up temp files immediately to free Vercel memory
        os.close(fd_pdf)
        os.close(fd_docx)
        if os.path.exists(temp_pdf): os.remove(temp_pdf)
        if os.path.exists(temp_docx): os.remove(temp_docx)
