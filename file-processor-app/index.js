import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import extractZip from 'extract-zip';
import csvParser from 'csv-parser';

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ answer: 'Method Not Allowed' });
  }

  try {
    // Parse the form data
    const { fields, files } = await new Promise((resolve, reject) => {
      const form = new formidable.IncomingForm({ keepExtensions: true });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    // Extract the question
    const question = fields.question || '';
    
    // Check if a file was uploaded
    if (!files.file) {
      return res.status(400).json({ answer: 'No file was uploaded' });
    }

    const file = files.file;
    
    // Create temp directories
    const tempDir = path.join(process.cwd(), 'tmp');
    const extractDir = path.join(tempDir, `extract_${Date.now()}`);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }
    
    try {
      // Extract the zip file
      await extractZip(file.filepath, { dir: extractDir });
      
      // Find the CSV file
      const extractedFiles = fs.readdirSync(extractDir);
      const csvFile = extractedFiles.find(f => f.endsWith('.csv'));
      
      if (!csvFile) {
        throw new Error('No CSV file found in the zip archive');
      }
      
      // Parse the CSV file
      const csvFilePath = path.join(extractDir, csvFile);
      const answer = await new Promise((resolve, reject) => {
        const results = [];
        
        fs.createReadStream(csvFilePath)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', () => {
            if (results.length > 0 && 'answer' in results[0]) {
              resolve(results[0].answer);
            } else {
              reject(new Error('No "answer" column found in the CSV file'));
            }
          })
          .on('error', reject);
      });
      
      return res.status(200).json({ answer });
    } finally {
      // Clean up
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ answer: `Error: ${error.message}` });
  }
}