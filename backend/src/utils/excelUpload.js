import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

// Shared multer config for .xlsx/.xls uploads: memory storage only (never written to disk),
// size-capped, and restricted by both extension and mimetype.
export const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const hasValidExtension = /\.(xlsx|xls)$/i.test(file.originalname);
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !hasValidExtension) {
      return cb(new Error('Only .xlsx or .xls files are allowed'));
    }
    cb(null, true);
  },
});

/** Express middleware wrapper that turns multer errors into clean 400 JSON responses. */
export function handleExcelUpload(req, res, next) {
  excelUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}
