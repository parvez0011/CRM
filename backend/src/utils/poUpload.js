import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
]);

// Client purchase orders may arrive as a spreadsheet or a PDF - memory storage only,
// size-capped, and restricted by both extension and mimetype.
export const poFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const hasValidExtension = /\.(xlsx|xls|pdf)$/i.test(file.originalname);
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !hasValidExtension) {
      return cb(new Error('Only .xlsx, .xls or .pdf files are allowed'));
    }
    cb(null, true);
  },
});

export function handlePoFileUpload(req, res, next) {
  poFileUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}
