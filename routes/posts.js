const express = require('express');
const router = express.Router();
const multer = require('multer')
const Posts = require('../models/Posts');

const upload = multer({ dest: 'uploads/' });
// Create posts
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, content, published } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const posts = new Posts({
      title,
      content,
      imageUrl,
      published
    });

    await posts.save();
    res.status(201).json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all posts
router.get('/', async (req, res) => {
  try {
    const posts = await Posts.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Other CRUD operations (update, delete, etc.) would go here

// export default router;

module.exports = router;