const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 30002;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scammers.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 6
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

function readScammers() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading scammers data:', error);
        return [];
    }
}

function writeScammers(scammers) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(scammers, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing scammers data:', error);
        return false;
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/detail/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detail.html'));
});

app.get('/api/scammers', (req, res) => {
    try {
        const scammers = readScammers();
        scammers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(scammers);
    } catch (error) {
        console.error('Error fetching scammers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/scammer/:id', (req, res) => {
    try {
        const { id } = req.params;
        const scammers = readScammers();
        const scammer = scammers.find(s => s.id === id);

        if (scammer) {
            res.json(scammer);
        } else {
            res.status(404).json({ error: 'Scammer tidak ditemukan' });
        }
    } catch (error) {
        console.error('Error fetching scammer by ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/api/scammer', upload.array('evidence', 6), (req, res) => {
    try {
        const { name, scamType, phone, website, description, socialMedia } = req.body;

        if (!name || !scamType) {
            return res.status(400).json({ error: 'Nama dan jenis penipuan wajib diisi' });
        }

        const evidenceFiles = req.files ? req.files.map(file => file.filename) : [];

        const newScammer = {
            id: Date.now().toString(),
            name: name.trim(),
            scamType: scamType.trim(),
            phone: phone ? phone.trim() : '',
            website: website ? website.trim() : '',
            description: description ? description.trim() : '',
            socialMedia: socialMedia ? socialMedia.trim() : '',
            evidence: evidenceFiles,
            createdAt: new Date().toISOString()
        };

        const scammers = readScammers();
        scammers.push(newScammer);

        if (writeScammers(scammers)) {
            res.status(201).json({
                success: true,
                message: 'Scammer berhasil ditambahkan',
                data: newScammer
            });
        } else {
            res.status(500).json({ error: 'Gagal menyimpan data' });
        }

    } catch (error) {
        console.error('Error adding scammer:', error);
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const filePath = path.join(UPLOADS_DIR, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/scammer/:id', (req, res) => {
    try {
        const { id } = req.params;
        const scammers = readScammers();
        
        const scammerIndex = scammers.findIndex(s => s.id === id);
        
        if (scammerIndex === -1) {
            return res.status(404).json({ error: 'Scammer tidak ditemukan' });
        }

        const scammerToDelete = scammers[scammerIndex];
        if (scammerToDelete.evidence && scammerToDelete.evidence.length > 0) {
            scammerToDelete.evidence.forEach(filename => {
                const filePath = path.join(UPLOADS_DIR, filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        scammers.splice(scammerIndex, 1);

        if (writeScammers(scammers)) {
            res.json({ success: true, message: 'Scammer berhasil dihapus' });
        } else {
            res.status(500).json({ error: 'Gagal menghapus data' });
        }

    } catch (error) {
        console.error('Error deleting scammer:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/search', (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.json([]);
        }

        const scammers = readScammers();
        const searchTerm = q.toLowerCase();

        const filtered = scammers.filter(scammer => 
            scammer.name.toLowerCase().includes(searchTerm) ||
            scammer.scamType.toLowerCase().includes(searchTerm) ||
            (scammer.phone && scammer.phone.includes(searchTerm)) ||
            (scammer.socialMedia && scammer.socialMedia.toLowerCase().includes(searchTerm)) ||
            (scammer.description && scammer.description.toLowerCase().includes(searchTerm))
        );

        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(filtered);
    } catch (error) {
        console.error('Error searching scammers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File terlalu besar. Maksimal 5MB per file.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Terlalu banyak file. Maksimal 6 file.' });
        }
    }
    
    if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({ error: 'Hanya file gambar yang diizinkan!' });
    }

    console.error('Unhandled error:', error.stack || error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.' });
});


app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

module.exports = app;
