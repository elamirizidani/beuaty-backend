const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Helper function: count common purchased products between two users
function countCommonProducts(purchasesA, purchasesB) {
    const setA = new Set(purchasesA.map(p => p.productId.toString()));
    const setB = new Set(purchasesB.map(p => p.productId.toString()));
    let commonCount = 0;
    setA.forEach(productId => {
        if (setB.has(productId)) commonCount++;
    });
    return commonCount;
}

// Gemini AI Enhanced Recommendation
router.get('/ai-recommendations', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).populate('purchaseHistory.productId');
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Get all available products
        const allProducts = await Product.find({}).limit(50); // Limit for performance
        
        // Prepare user context for Gemini
        const userContext = {
            preferences: user.preferences || {},
            purchaseHistory: user.purchaseHistory.map(p => ({
                productName: p.productId.name,
                category: p.productId.category,
                attributes: p.productId.attributes,
                rating: p.rating || null,
                purchaseDate: p.purchaseDate
            })),
            demographics: {
                age: user.age || null,
                location: user.location || null
            }
        };

        // Prepare products context
        const productsContext = allProducts.map(product => ({
            id: product._id.toString(),
            name: product.name,
            category: product.category,
            attributes: product.attributes,
            price: product.price,
            rating: product.averageRating || 0,
            description: product.description
        }));

        // Create prompt for Gemini
        const prompt = `
        You are an AI recommendation system for hair care products. Based on the user's profile and purchase history, recommend the top 10 most suitable products.

        User Profile:
        ${JSON.stringify(userContext, null, 2)}

        Available Products:
        ${JSON.stringify(productsContext, null, 2)}

        Please analyze the user's preferences, purchase history, and provide personalized recommendations. Consider:
        1. Hair type compatibility
        2. Past purchase patterns
        3. Product ratings and quality
        4. Price range preferences
        5. Seasonal or demographic factors

        Return ONLY a JSON array of product IDs in order of recommendation priority (most recommended first). Format: ["productId1", "productId2", ...]
        
        Limit to maximum 10 recommendations.
        `;

        // Get recommendations from Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Parse the response
        let recommendedProductIds;
        try {
            recommendedProductIds = JSON.parse(text.trim());
        } catch (parseError) {
            // Fallback to regex extraction if JSON parsing fails
            const matches = text.match(/\["[^"]+"\]/);
            if (matches) {
                recommendedProductIds = JSON.parse(matches[0]);
            } else {
                throw new Error('Failed to parse AI response');
            }
        }

        // Fetch full product details
        const recommendedProducts = await Product.find({
            _id: { $in: recommendedProductIds }
        });

        // Sort products according to AI recommendation order
        const sortedProducts = recommendedProductIds.map(id => 
            recommendedProducts.find(p => p._id.toString() === id)
        ).filter(Boolean);

        res.json({ 
            recommendedProducts: sortedProducts,
            recommendationSource: 'gemini-ai'
        });

    } catch (err) {
        console.error('Gemini AI recommendation error:', err);
        res.status(500).json({ message: 'AI recommendation service error' });
    }
});

// Hybrid Recommendation: Combines AI with traditional methods
router.get('/hybrid', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).populate('purchaseHistory.productId');
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Get content-based recommendations
        const userHairType = user.preferences?.hairType;
        let contentBasedProducts = [];
        if (userHairType) {
            contentBasedProducts = await Product.find({
                'attributes.hairType': userHairType
            }).limit(20);
        }

        // Get collaborative filtering recommendations
        const otherUsers = await User.find({ _id: { $ne: user._id } })
            .limit(50)
            .populate('purchaseHistory.productId');

        const similarityScores = otherUsers.map(otherUser => {
            const commonCount = countCommonProducts(user.purchaseHistory, otherUser.purchaseHistory);
            return { user: otherUser, score: commonCount };
        });

        similarityScores.sort((a, b) => b.score - a.score);
        const topUsers = similarityScores.slice(0, 3).map(s => s.user);

        const currentUserProducts = new Set(user.purchaseHistory.map(p => p.productId._id.toString()));
        const collaborativeProductIds = new Set();

        topUsers.forEach(similarUser => {
            similarUser.purchaseHistory.forEach(purchase => {
                const prodId = purchase.productId._id.toString();
                if (!currentUserProducts.has(prodId)) {
                    collaborativeProductIds.add(prodId);
                }
            });
        });

        const collaborativeProducts = await Product.find({
            _id: { $in: Array.from(collaborativeProductIds) }
        }).limit(20);

        // Combine all candidate products
        const allCandidates = [...contentBasedProducts, ...collaborativeProducts];
        const uniqueCandidates = Array.from(
            new Map(allCandidates.map(p => [p._id.toString(), p])).values()
        );

        // Use Gemini AI to rank and filter the combined recommendations
        const candidatesContext = uniqueCandidates.map(product => ({
            id: product._id.toString(),
            name: product.name,
            category: product.category,
            attributes: product.attributes,
            price: product.price,
            rating: product.averageRating || 0
        }));

        const userContext = {
            preferences: user.preferences || {},
            purchaseHistory: user.purchaseHistory.map(p => ({
                productName: p.productId.name,
                category: p.productId.category,
                attributes: p.productId.attributes
            }))
        };

        const hybridPrompt = `
        Given this user profile and a list of candidate products (from content-based and collaborative filtering), 
        rank the top 10 most suitable products for recommendation.

        User Profile:
        ${JSON.stringify(userContext, null, 2)}

        Candidate Products:
        ${JSON.stringify(candidatesContext, null, 2)}

        Return ONLY a JSON array of the top 10 product IDs in order of preference: ["id1", "id2", ...]
        `;

        const result = await model.generateContent(hybridPrompt);
        const response = await result.response;
        const text = response.text();
        
        let rankedProductIds;
        try {
            rankedProductIds = JSON.parse(text.trim());
        } catch (parseError) {
            // Fallback: return first 10 unique candidates
            rankedProductIds = uniqueCandidates.slice(0, 10).map(p => p._id.toString());
        }

        const finalRecommendations = await Product.find({
            _id: { $in: rankedProductIds }
        });

        // Sort according to AI ranking
        const sortedRecommendations = rankedProductIds.map(id => 
            finalRecommendations.find(p => p._id.toString() === id)
        ).filter(Boolean);

        res.json({ 
            recommendedProducts: sortedRecommendations,
            recommendationSource: 'hybrid-ai'
        });

    } catch (err) {
        console.error('Hybrid recommendation error:', err);
        res.status(500).json({ message: 'Hybrid recommendation service error' });
    }
});

// Content-Based Recommendation: by user's hairType preference (original)
router.get('/content-based', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userHairType = user.preferences?.hairType;
        if (!userHairType) return res.status(400).json({ message: 'User preferences not set' });

        const recommendedProducts = await Product.find({
            'attributes.hairType': userHairType
        }).limit(10);

        res.json({ recommendedProducts });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Collaborative Filtering Recommendation (original)
router.get('/collaborative', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const currentUser = await User.findById(userId).populate('purchaseHistory.productId');
        if (!currentUser) return res.status(404).json({ message: 'User not found' });

        const otherUsers = await User.find({ _id: { $ne: currentUser._id } })
            .limit(100)
            .populate('purchaseHistory.productId');

        const similarityScores = otherUsers.map(otherUser => {
            const commonCount = countCommonProducts(currentUser.purchaseHistory, otherUser.purchaseHistory);
            return { user: otherUser, score: commonCount };
        });

        similarityScores.sort((a, b) => b.score - a.score);
        const topUsers = similarityScores.slice(0, 5).map(s => s.user);

        const currentUserProducts = new Set(currentUser.purchaseHistory.map(p => p.productId._id.toString()));
        const recommendedProductIds = new Set();

        topUsers.forEach(user => {
            user.purchaseHistory.forEach(purchase => {
                const prodId = purchase.productId._id.toString();
                if (!currentUserProducts.has(prodId)) {
                    recommendedProductIds.add(prodId);
                }
            });
        });

        const recommendedProducts = await Product.find({ 
            _id: { $in: Array.from(recommendedProductIds) } 
        }).limit(10);

        res.json({ recommendedProducts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});



router.get('/suggest-new-products', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).populate('purchaseHistory.productId');
        
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Get current product catalog to know what we already have
        const existingProducts = await Product.find({}).select('name category attributes description');
        
        // Prepare user context
        const userContext = {
            preferences: user.preferences || {},
            purchaseHistory: user.purchaseHistory.map(p => ({
                productName: p.productId.name,
                category: p.productId.category,
                attributes: p.productId.attributes,
                rating: p.rating || null,
                purchaseDate: p.purchaseDate,
                price: p.productId.price
            })),
            demographics: {
                age: user.age || null,
                location: user.location || null,
                skinType: user.preferences?.skinType || null,
                hairType: user.preferences?.hairType || null,
                concerns: user.preferences?.concerns || []
            }
        };

        // Current product catalog context
        const catalogContext = existingProducts.map(product => ({
            name: product.name,
            category: product.category,
            attributes: product.attributes,
            description: product.description
        }));

        const prompt = `
        You are a product development AI for a hair care e-commerce platform. Based on the user's profile and current product catalog, suggest 8-10 NEW hair care products that would be perfect for this user but are NOT currently available in the catalog.

        User Profile:
        ${JSON.stringify(userContext, null, 2)}

        Current Product Catalog (DO NOT suggest these products):
        ${JSON.stringify(catalogContext, null, 2)}

        Please suggest NEW products that:
        1. Match the user's hair type and preferences
        2. Address their specific hair concerns
        3. Complement their purchase history
        4. Are realistic and exist in the market
        5. Are NOT similar to products already in the catalog
        6. Include innovative or trending hair care solutions

        For each product suggestion, provide:
        - name: Product name
        - category: Product category (shampoo, conditioner, treatment, styling, etc.)
        - description: Detailed product description (50-100 words)
        - keyIngredients: Array of main ingredients
        - benefits: Array of key benefits
        - hairType: Compatible hair types
        - priceRange: Estimated price range (e.g., "$15-25")
        - brand: Suggested brand type (premium, drugstore, natural, etc.)
        - why: Why this product is recommended for this specific user (2-3 sentences)

        Return ONLY a valid JSON array of product objects. Example format:
        [
          {
            "name": "Product Name",
            "category": "treatment",
            "description": "Product description...",
            "keyIngredients": ["ingredient1", "ingredient2"],
            "benefits": ["benefit1", "benefit2"],
            "hairType": ["curly", "dry"],
            "priceRange": "$20-30",
            "brand": "premium",
            "why": "This product addresses your specific needs because..."
          }
        ]
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let suggestedProducts;
        try {
            // Clean the response text to extract JSON
            const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
            suggestedProducts = JSON.parse(cleanText);
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            throw new Error('Failed to parse product suggestions');
        }





        // const productsWithImageData = await Promise.all(
        //     suggestedProducts.map(async (product, index) => {
        //         try {
        //             // Add small delay to avoid rate limiting
        //             if (index > 0) {
        //                 await new Promise(resolve => setTimeout(resolve, 500));
        //             }
                    
        //             const imageData = await generateProductImagePrompt(product);
        //             return {
        //                 ...product,
        //                 imageGeneration: imageData,
        //                 id: `suggested_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Unique ID for frontend
        //             };
        //         } catch (imageError) {
        //             console.error(`Failed to generate image prompt for ${product.name}:`, imageError);
        //             return {
        //                 ...product,
        //                 imageGeneration: {
        //                     prompt: `Professional product photo of ${product.name}`,
        //                     placeholderImage: createSimplePlaceholder(product.name),
        //                     source: 'fallback',
        //                     error: 'Image prompt generation failed'
        //                 },
        //                 id: `suggested_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        //             };
        //         }
        //     })
        // );


        // res.json({ 
        //     suggestedProducts: productsWithImageData,
        //     userProfile: {
        //         hairType: user.preferences?.hairType,
        //         concerns: user.preferences?.concerns,
        //         recentPurchases: user.purchaseHistory.slice(-3).map(p => p.productId.name)
        //     },
        //     recommendationSource: 'gemini-ai-with-image-prompts',
        //     message: 'These are new product suggestions with Gemini-generated image prompts and mockups based on your profile',
        //     imageGeneration: {
        //         totalProducts: productsWithImageData.length,
        //         successfulPrompts: productsWithImageData.filter(p => p.imageGeneration.source !== 'fallback').length,
        //         generationMethod: 'gemini-ai-prompts-with-svg-mockups',
        //         instructions: 'Use the generated prompts with any AI image generator (DALL-E, Midjourney, Stable Diffusion, etc.) to create actual product photos'
        //     }
        // });


        res.json({ 
            suggestedProducts,
            userProfile: {
                hairType: user.preferences?.hairType,
                concerns: user.preferences?.concerns,
                recentPurchases: user.purchaseHistory.slice(-3).map(p => p.productId.name)
            },
            recommendationSource: 'ai-product-suggestion',
            message: 'These are new product suggestions based on your profile that are not currently in our catalog'
        });

    } catch (err) {
        console.error('AI product suggestion error:', err);
        res.status(500).json({ message: 'Product suggestion service error' });
    }
});

// Market Gap Analysis: Identify product categories missing from catalog
router.get('/market-analysis', authMiddleware, async (req, res) => {
    try {
        // Get all users and their preferences/purchase history
        const users = await User.find({})
            .populate('purchaseHistory.productId')
            .limit(100); // Limit for performance

        // Get current product catalog
        const existingProducts = await Product.find({});
        
        // Analyze user patterns and current catalog
        const userPatterns = users.map(user => ({
            preferences: user.preferences || {},
            purchaseHistory: user.purchaseHistory.map(p => ({
                category: p.productId.category,
                attributes: p.productId.attributes
            }))
        }));

        const catalogAnalysis = {
            categories: [...new Set(existingProducts.map(p => p.category))],
            hairTypes: [...new Set(existingProducts.flatMap(p => p.attributes?.hairType || []))],
            totalProducts: existingProducts.length,
            priceRanges: existingProducts.map(p => p.price)
        };

        const prompt = `
        You are a market analysis AI for a hair care e-commerce platform. Analyze the user patterns and current product catalog to identify market gaps and opportunities.

        User Patterns:
        ${JSON.stringify(userPatterns, null, 2)}

        Current Catalog Analysis:
        ${JSON.stringify(catalogAnalysis, null, 2)}

        Identify:
        1. Product categories that users need but are missing from catalog
        2. Hair types or concerns that are underserved
        3. Price gaps in the market
        4. Trending product types that should be added
        5. Seasonal or demographic-specific products missing

        Provide analysis in this JSON format:
        {
          "missingCategories": ["category1", "category2"],
          "underservedHairTypes": ["type1", "type2"],
          "priceGaps": {
            "budget": "Products under $X",
            "premium": "Products over $Y"
          },
          "trendingOpportunities": ["trend1", "trend2"],
          "recommendations": [
            {
              "category": "category name",
              "reason": "why this category is needed",
              "priority": "high/medium/low",
              "estimatedDemand": "percentage of users who would benefit"
            }
          ]
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let marketAnalysis;
        try {
            const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
            marketAnalysis = JSON.parse(cleanText);
        } catch (parseError) {
            console.error('Failed to parse market analysis:', parseError);
            throw new Error('Failed to parse market analysis');
        }

        res.json({
            marketAnalysis,
            catalogStats: {
                totalProducts: existingProducts.length,
                categories: catalogAnalysis.categories.length,
                averagePrice: catalogAnalysis.priceRanges.reduce((a, b) => a + b, 0) / catalogAnalysis.priceRanges.length
            },
            generatedAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('Market analysis error:', err);
        res.status(500).json({ message: 'Market analysis service error' });
    }
});

// Personalized Product Creation: Create a custom product concept for specific user
router.post('/create-custom-product', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { specificNeeds, budget, preferences } = req.body;
        
        const user = await User.findById(userId).populate('purchaseHistory.productId');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userContext = {
            preferences: { ...user.preferences, ...preferences },
            purchaseHistory: user.purchaseHistory.map(p => ({
                productName: p.productId.name,
                category: p.productId.category,
                attributes: p.productId.attributes,
                rating: p.rating
            })),
            specificNeeds: specificNeeds || [],
            budget: budget || null
        };

        const prompt = `
        Create a completely custom hair care product concept specifically designed for this user's unique needs and preferences.

        User Profile:
        ${JSON.stringify(userContext, null, 2)}

        Design a product that:
        1. Perfectly matches their hair type and concerns
        2. Addresses their specific needs mentioned
        3. Fits within their budget range
        4. Uses ingredients that would work well for them
        5. Has a formulation that complements their current routine

        Create a detailed product concept with:
        - name: Creative, appealing product name
        - tagline: Catchy one-liner
        - category: Product type
        - description: Detailed description (100-150 words)
        - keyIngredients: Specific ingredients and why they're chosen
        - benefits: Detailed benefits list
        - usage: How to use the product
        - targetPrice: Specific price point
        - packaging: Packaging concept
        - marketingAngle: How to market this product
        - whyPerfect: Detailed explanation of why this is perfect for this user

        Return as a JSON object with all these fields.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let customProduct;
        try {
            const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
            customProduct = JSON.parse(cleanText);
        } catch (parseError) {
            console.error('Failed to parse custom product:', parseError);
            throw new Error('Failed to create custom product concept');
        }

        res.json({
            customProduct,
            createdFor: {
                userId: user._id,
                hairType: user.preferences?.hairType,
                specificNeeds,
                budget
            },
            createdAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('Custom product creation error:', err);
        res.status(500).json({ message: 'Custom product creation service error' });
    }
});

module.exports = router;