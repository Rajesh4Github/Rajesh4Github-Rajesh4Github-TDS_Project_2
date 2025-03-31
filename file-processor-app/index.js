import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import extractZip from 'extract-zip';
import csvParser from 'csv-parser';

// Disable the default body parser to handle form data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ answer: 'Method Not Allowed' });
  }

  try {
    // Parse the incoming form data
    const { fields, files } = await parseForm(req);
    
    // Extract the question
    const question = fields.question ? fields.question[0] : '';
    
    // Check if a file was uploaded
    if (!files.file) {
      return res.status(400).json({ answer: 'No file was uploaded' });
    }

    // Process the uploaded file
    const answer = await processFile(files.file[0], question);
    
    // Return the answer
    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ answer: `Error: ${error.message}` });
  }
}

// Function to parse the form data
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

// Function to process the file based on the question
async function processFile(file, question) {
  const tempDir = path.join(process.cwd(), 'tmp');
  const extractDir = path.join(tempDir, 'extract');
  
  // Create temp directories if they don't exist
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir);
  
  try {
    // Extract the zip file
    await extractZip(file.filepath, { dir: extractDir });
    
    // Find the CSV file
    const files = fs.readdirSync(extractDir);
    const csvFile = files.find(file => file.endsWith('.csv'));
    
    if (!csvFile) {
      throw new Error('No CSV file found in the zip archive');
    }
    
    // Parse the CSV file and extract the answer
    const csvFilePath = path.join(extractDir, csvFile);
    const answer = await extractAnswerFromCSV(csvFilePath);
    
    return answer;
  } finally {
    // Clean up temp files
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  }
}

// Function to extract the answer from the CSV file
function extractAnswerFromCSV(csvFilePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(csvFilePath)
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Check if the CSV has an "answer" column
        if (results.length > 0 && 'answer' in results[0]) {
          resolve(results[0].answer);
        } else {
          reject(new Error('No "answer" column found in the CSV file'));
        }
      })
      .on('error', reject);
  });
}
