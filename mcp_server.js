// Serveur MCP simple pour tester l'intégration avec le plugin Figma
const http = require('http');
const url = require('url');

// Port du serveur
const port = 3000;

// Fonction pour activer CORS
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Configuration du serveur MCP
const mcpConfig = {
  name: "FigmaAnalysisMCPServer",
  description: "MCP Server dédié à l'analyse de projets Figma",
  version: "1.0.0",
  tools: [
    "analyze_figma_project",
    "extract_project_screens", 
    "analyze_screen_content",
    "export_screenshots_batch",
    'detect_user_flows',
    'extract_design_system'
  ]
};

// Fonction pour parser le JSON des requêtes
async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body));
        } else {
          resolve({});
        }
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Fonction pour envoyer une réponse JSON
function sendJsonResponse(res, data, statusCode = 200) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Fonction pour appeler le webhook N8N
async function callN8NWebhook(analysisData) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook-test/contextual-project-analysis';
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.N8N_API_KEY || ''}`
      },
      body: JSON.stringify(analysisData)
    });
    
    const data = await response.json();
    console.log('📊 Réponse du webhook N8N:', data);
    return data;
  } catch (error) {
    console.error('❌ Erreur lors de l\'appel au webhook N8N:', error);
    throw error;
  }
}

// Fonction pour récupérer les données d'un fichier Figma
async function getFigmaFileData(fileKey) {
  const figmaToken = process.env.FIGMA_TOKEN;
  if (!figmaToken) {
    throw new Error('Token Figma non configuré dans les variables d\'environnement');
  }
  
  try {
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: {
        'X-Figma-Token': figmaToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API Figma: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des données Figma:', error);
    throw error;
  }
}

// Fonction pour extraire les écrans d'un fichier Figma
function extractScreensFromFigmaData(figmaData) {
  const screens = [];
  
  // Extraire les écrans (frames de premier niveau)
  figmaData.document.children.forEach(child => {
    if (child.type === 'FRAME') {
      screens.push({
        id: child.id,
        name: child.name,
        type: child.type
      });
    }
  });
  
  return screens;
}

// Fonction pour extraire les composants d'un fichier Figma
function extractComponentsFromFigmaData(figmaData) {
  const components = [];
  
  // Extraire les composants
  figmaData.document.children.forEach(child => {
    if (child.type === 'COMPONENT') {
      components.push({
        id: child.id,
        name: child.name,
        type: child.type
      });
    }
  });
  
  return components;
}

// Fonction pour extraire les styles d'un fichier Figma
function extractStylesFromFigmaData(figmaData) {
  const styles = {};
  
  // Extraire les styles
  figmaData.document.children.forEach(child => {
    if (child.type === 'STYLE') {
      styles[child.name] = child;
    }
  });
  
  return styles;
}

// Fonction pour analyser un fichier Figma avec GPT-4o Vision
async function analyzeWithGPT4oVision(figmaData, prompt, imageUrls) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('Clé API OpenAI non configurée dans les variables d\'environnement');
  }
  
  console.log('🧠 Analyse avec GPT-4o Vision...');
  
  try {
    // Préparer le contenu pour GPT-4o Vision
    const messages = [
      {
        role: "system",
        content: "Tu es un Product Manager expert qui analyse des designs Figma pour générer des spécifications détaillées et contextualisées."
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          // Ajouter les images des écrans
          ...Object.values(imageUrls).map(url => ({
            type: "image_url",
            image_url: { url }
          })),
          // Ajouter les données structurelles Figma en texte
          { 
            type: "text", 
            text: `Données structurelles du fichier Figma:\n${JSON.stringify(figmaData, null, 2)}`
          }
        ]
      }
    ];
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur API OpenAI: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('✅ Analyse GPT-4o Vision terminée');
    return data;
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse avec GPT-4o Vision:', error);
    throw error;
  }
}

// Fonction pour récupérer les images des écrans Figma
async function getFigmaImages(fileKey, nodeIds) {
  console.log(`📸 Récupération des images pour ${nodeIds.length} écrans...`);
  
  // Vérifier si c'est un ID temporaire (mode développement)
  if (fileKey.startsWith('temp_')) {
    console.log('🔧 ID temporaire détecté:', fileKey);
    console.log('🖼️ Génération d\'URLs d\'images placeholder...');
    
    // Générer des URLs de placeholder pour chaque nodeId
    const placeholderImages = {};
    nodeIds.forEach(nodeId => {
      // Utiliser un service de placeholder d'image pour générer une vraie image
      const nodeIdShort = nodeId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
      placeholderImages[nodeId] = `https://via.placeholder.com/800x600?text=Screen_${nodeIdShort}`;
    });
    
    console.log('✅ Images placeholder générées:', Object.keys(placeholderImages).length);
    return placeholderImages;
  }
  
  // Mode normal avec l'API Figma
  const figmaToken = process.env.FIGMA_TOKEN;
  if (!figmaToken) {
    throw new Error('Token Figma non configuré dans les variables d\'environnement');
  }
  
  // Convertir le tableau de nodeIds en chaîne séparée par des virgules
  const nodeIdsParam = nodeIds.join(',');
  
  try {
    console.log(`🔄 Appel API Figma pour fichier ${fileKey}...`);
    // Demander à Figma de générer les images
    const response = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${nodeIdsParam}&format=png&scale=2`, {
      headers: {
        'X-Figma-Token': figmaToken
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Erreur API Figma: ${response.status}`);
      const errorText = await response.text();
      console.error('Détails:', errorText);
      throw new Error(`Erreur API Figma Images: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ URLs des images récupérées avec succès:', Object.keys(data.images || {}).length);
    
    // Vérifier si les images sont prêtes ou s'il faut attendre
    if (data.err || !data.images) {
      throw new Error('Erreur lors de la génération des images');
    }
    
    return data.images; // Objet avec nodeId comme clé et URL comme valeur
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des images:', error);
    throw error;
  }
}

// Fonction pour télécharger les images et les stocker (optionnel)
async function downloadAndStoreImages(imageUrls) {
  console.log('💾 Téléchargement et stockage des images...');
  
  const imageData = {};
  
  // Télécharger chaque image
  for (const [nodeId, url] of Object.entries(imageUrls)) {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Erreur lors du téléchargement de l'image: ${response.status}`);
      }
      
      // Option 1: Stocker en base64 (pour les petites images)
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      imageData[nodeId] = {
        url: url,
        base64: `data:image/png;base64,${base64}`
      };
      
      // Option 2: Stocker sur Cloudinary (pour les projets en production)
      // Nécessite l'installation du package cloudinary
      /*
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET
        });
        
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'figma-screens' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          
          uploadStream.end(buffer);
        });
        
        imageData[nodeId].cloudinary_url = result.secure_url;
      }
      */
      
    } catch (error) {
      console.error(`❌ Erreur pour l'image ${nodeId}:`, error);
      imageData[nodeId] = { error: error.message };
    }
  }
  
  return imageData;
}

// Création du serveur HTTP
const server = http.createServer(async (req, res) => {
  // Gérer les requêtes OPTIONS pour CORS
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Analyser l'URL de la requête
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Route pour vérifier si le serveur est en ligne
  if (pathname === '/mcp/ping' && req.method === 'GET') {
    console.log('📱 Ping reçu');
    sendJsonResponse(res, {
      status: 'ok',
      version: mcpConfig.version,
      name: mcpConfig.name
    });
    return;
  }
  
  // Route pour les informations du serveur MCP (pour Windsurf)
  if (pathname === '/mcp/info' && req.method === 'GET') {
    sendJsonResponse(res, {
      name: 'FigmaAnalysisMCPServer',
      description: 'MCP Server dédié à l\'analyse de projets Figma',
      version: '1.0.0',
      tools: [
        'analyze_figma_project',
        'extract_project_screens', 
        'analyze_screen_content',
        'export_screenshots_batch',
        'detect_user_flows',
        'extract_design_system'
      ],
      tool_definitions: {
        analyze_figma_project: {
          description: 'Outil principal d\'analyse de projets Figma',
          params: ['figma_file_key', 'business_context', 'options']
        },
        extract_project_screens: {
          description: 'Extraction des écrans d\'un projet Figma',
          params: ['figma_file_key']
        },
        analyze_screen_content: {
          description: 'Analyse détaillée du contenu d\'un écran',
          params: ['screen_id', 'screen_name']
        },
        export_screenshots_batch: {
          description: 'Export en lot des captures d\'écran',
          params: ['screen_ids']
        },
        detect_user_flows: {
          description: 'Détection des flux utilisateur',
          params: ['screens']
        },
        extract_design_system: {
          description: 'Extraction du design system',
          params: ['figma_file_key']
        }
      }
    });
    return;
  }
  
  // Route pour l'analyse d'un projet Figma complet
  if (pathname === '/mcp/analyze_figma_project' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      console.log('🔍 Analyse projet Figma:', body);
      
      // Vérifier les paramètres requis
      if (!body.figma_file_key) {
        sendJsonResponse(res, { error: 'figma_file_key est requis' }, 400);
        return;
      }
      
      // Traitement asynchrone
      (async () => {
        try {
          // Récupérer les données du fichier Figma
          const figmaData = await getFigmaFileData(body.figma_file_key);
          
          // Analyser avec GPT-4o Vision si le contexte business est fourni
          let analysisResults = {
            status: 'success',
            figma_file_key: body.figma_file_key,
            screens: [],
            components: [],
            styles: {},
            processing_time: 0,
            quality_score: 0
          };
          
          // Extraire les informations de base du fichier Figma
          if (figmaData.document) {
            // Extraire les écrans (frames de premier niveau)
            const screens = extractScreensFromFigmaData(figmaData);
            analysisResults.screens = screens;
            
            // Récupérer les images des écrans
            if (screens.length > 0) {
              const screenIds = screens.map(screen => screen.id);
              const imageUrls = await getFigmaImages(body.figma_file_key, screenIds);
              
              // Associer les URLs des images aux écrans
              screens.forEach(screen => {
                screen.image_url = imageUrls[screen.id] || null;
              });
              
              // Option: télécharger et stocker les images
              if (body.download_images) {
                const imageData = await downloadAndStoreImages(imageUrls);
                analysisResults.image_data = imageData;
              }
            }
            
            // Extraire les composants
            const components = extractComponentsFromFigmaData(figmaData);
            analysisResults.components = components;
            
            // Extraire les styles
            const styles = extractStylesFromFigmaData(figmaData);
            analysisResults.styles = styles;
          }
          
          // Analyser avec GPT-4o Vision si le contexte business est fourni
          if (body.business_context) {
            console.log('📝 Contexte business fourni, analyse avec GPT-4o Vision...');
            
            // Préparer un prompt enrichi avec les URLs des images
            let promptWithImages = `
              Analyse ce fichier Figma dans le contexte business suivant: "${body.business_context}".
              
              Voici les écrans principaux et leurs URLs d'image:
              ${analysisResults.screens.map(screen => 
                `- ${screen.name}: ${screen.image_url || 'Pas d\'image disponible'}`
              ).join('\n')}
              
              Voici les données structurelles du fichier Figma:
              ${JSON.stringify(figmaData, null, 2)}
              
              Fournir une analyse détaillée incluant:
              1. Structure générale du projet
              2. Écrans principaux et leur fonction
              3. Composants réutilisables identifiés
              4. Système de design (couleurs, typographie, espacement)
              5. Flux utilisateur identifiés
              6. Recommandations pour l'implémentation
              7. Estimation de l'effort de développement
            `;
            
            const gpt4oAnalysis = await analyzeWithGPT4oVision(figmaData, promptWithImages, analysisResults.screens.reduce((acc, screen) => ({ ...acc, [screen.id]: screen.image_url }), {}));
            analysisResults.ai_analysis = gpt4oAnalysis;
          }
          
          // Calculer le temps de traitement et le score de qualité
          analysisResults.processing_time = Math.random() * 2 + 0.5; // Simulé entre 0.5 et 2.5 secondes
          analysisResults.quality_score = Math.random() * 0.3 + 0.7; // Simulé entre 0.7 et 1.0
          
          // Envoyer les résultats au webhook N8N
          console.log('📤 Envoi des données au webhook N8N...');
          await callN8NWebhook(analysisResults);
          
          // Répondre au client
          sendJsonResponse(res, analysisResults);
        } catch (error) {
          console.error('❌ Erreur lors du traitement:', error);
          sendJsonResponse(res, { error: error.message }, 500);
        }
      })();
    } catch (error) {
      console.error('Erreur:', error);
      sendJsonResponse(res, { error: 'Erreur de parsing JSON' }, 400);
    }
    return;
  }
  
  // Route pour l'extraction des écrans d'un projet
  if (pathname === '/mcp/extract_project_screens' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      console.log('📋 Extraction des écrans:', body);
      
      // Traitement asynchrone pour extraire les vrais écrans
      (async () => {
        try {
          // Vérifier les paramètres requis
          if (!body.figma_file_key) {
            sendJsonResponse(res, { error: 'figma_file_key est requis' }, 400);
            return;
          }
          
          // Récupérer les données du fichier Figma
          const figmaData = await getFigmaFileData(body.figma_file_key);
          
          // Extraire les écrans (frames de premier niveau)
          const screens = extractScreensFromFigmaData(figmaData);
          
          // Récupérer les IDs des écrans
          const screenIds = screens.map(screen => screen.id);
          
          // Récupérer les vraies URLs des images via l'API Figma
          const imageUrls = await getFigmaImages(body.figma_file_key, screenIds);
          
          // Associer les URLs des images aux écrans
          screens.forEach(screen => {
            screen.thumbnail_url = imageUrls[screen.id] || null;
          });
          
          sendJsonResponse(res, {
            status: 'success',
            screens_extracted: screens.length,
            screens: screens
          });
        } catch (error) {
          console.error('❌ Erreur lors de l\'extraction des écrans:', error);
          sendJsonResponse(res, { error: error.message }, 500);
        }
      })();
    } catch (error) {
      console.error('Erreur:', error);
      sendJsonResponse(res, { error: 'Erreur de parsing JSON' }, 400);
    }
    return;
  }
  
  // Route pour l'analyse du contenu d'un écran
  if (pathname === '/mcp/analyze_screen_content' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      console.log('🔍 Analyse du contenu d\'écran:', body);
      
      // Vérifier le format des données reçues
      const screenData = body.screen || {};
      const screenId = screenData.id || body.screen_id || 'unknown';
      const screenName = screenData.name || body.screen_name || 'Écran sans nom';
      const figmaFileKey = body.figma_file_key;
      
      console.log('💾 ID écran détecté:', screenId);
      console.log('📄 Nom écran:', screenName);
      console.log('🔑 Fichier Figma:', figmaFileKey);
      
      // Traitement asynchrone pour l'analyse avec GPT-4o Vision
      (async () => {
        try {
          // 1. Récupérer l'image de l'écran
          console.log('📷 Récupération de l\'image pour l\'analyse...');
          const imageUrls = await getFigmaImages(figmaFileKey, [screenId]);
          
          if (!imageUrls || !imageUrls[screenId]) {
            throw new Error('Impossible de récupérer l\'image de l\'écran');
          }
          
          console.log('✅ Image récupérée:', imageUrls[screenId]);
          
          // 2. Préparer le prompt pour GPT-4o Vision
          const prompt = `Analyse cet écran Figma nommé "${screenName}" et fournit une analyse détaillée des éléments suivants:
          
          1. Éléments interactifs (boutons, champs, menus, etc.)
          2. Structure du contenu et hiérarchie visuelle
          3. Flux utilisateur et navigation
          4. Accessibilité et ergonomie
          5. Cohérence avec les bonnes pratiques UX/UI
          
          Fournis une analyse structurée avec des recommandations concrètes.`;
          
          // 3. Analyser avec GPT-4o Vision
          console.log('🧠 Analyse avec GPT-4o Vision en cours...');
          const analysisResult = await analyzeWithGPT4oVision(null, prompt, { [screenId]: imageUrls[screenId] });
          
          // 4. Extraire et formater la réponse
          const gptResponse = analysisResult.choices[0].message.content;
          console.log('✅ Analyse GPT-4o Vision terminée');
          
          // 5. Structurer la réponse pour le client
          const response = {
            status: 'success',
            id: screenId,
            screen_id: screenId,
            screen_name: screenName,
            analysis_timestamp: new Date().toISOString(),
            content_analysis: {
              gpt_analysis: gptResponse,
              // Conserver quelques données structurées pour compatibilité
              interactive_elements: [
                { type: 'button', count: 3, primary_action: true },
                { type: 'input', count: 2, required: true }
              ],
              text_elements: {
                headings: 2,
                paragraphs: 4
              }
            },
            processing_time: ((new Date() - new Date(analysisResult.created * 1000)) / 1000).toFixed(2)
          };
          
          sendJsonResponse(res, response);
        } catch (error) {
          console.error('❌ Erreur lors de l\'analyse avec GPT-4o Vision:', error);
          sendJsonResponse(res, { 
            error: `Erreur d'analyse: ${error.message}`,
            status: 'error',
            id: screenId,
            screen_id: screenId,
            screen_name: screenName
          }, 500);
        }
      })();
    } catch (error) {
      console.error('Erreur d\'analyse d\'écran:', error);
      sendJsonResponse(res, { error: 'Erreur de parsing JSON pour l\'analyse d\'écran' }, 400);
    }
    return;
  }
  
  // Route pour l'export et upload de screenshots par lots
  if (pathname === '/mcp/export_screenshots_batch' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      console.log('📟 MCP reçu export_screenshots_batch:', body);
      
      // Traitement asynchrone pour récupérer les vraies images
      (async () => {
        try {
          const { screens, figma_file_key } = body;
          
          // Vérifier les paramètres requis
          if (!screens || !Array.isArray(screens)) {
            console.error('❌ Erreur: screens (array) requis');
            sendJsonResponse(res, { error: 'screens (array) requis' }, 400);
            return;
          }
          
          if (!figma_file_key || typeof figma_file_key !== 'string') {
            console.error('❌ Erreur: figma_file_key (string) requis');
            sendJsonResponse(res, { error: 'figma_file_key (string) requis' }, 400);
            return;
          }
          
          console.log('📷 Traitement de', screens.length, 'écrans du fichier', figma_file_key);
          
          // Récupérer les IDs des écrans de façon sécurisée
          const screenIds = [];
          for (const screen of screens) {
            if (screen && screen.id) {
              screenIds.push(screen.id);
            } else if (screen && typeof screen === 'string') {
              // Si on reçoit directement des IDs au lieu d'objets
              screenIds.push(screen);
            }
          }
          
          if (screenIds.length === 0) {
            console.error('❌ Aucun ID d\'écran valide trouvé');
            sendJsonResponse(res, { error: 'Aucun ID d\'écran valide' }, 400);
            return;
          }
          
          console.log('💾 IDs des écrans extraits:', screenIds);
          
          // Récupérer les vraies URLs des images via l'API Figma
          const imageUrls = await getFigmaImages(figma_file_key, screenIds);
          console.log('🎨 URLs des images récupérées:', Object.keys(imageUrls).length);
          
          // Retourner les écrans avec les vraies URLs d'images
          const screensWithImages = screens.map(screen => {
            const screenId = screen.id || screen;
            return {
              ...(typeof screen === 'object' ? screen : { id: screen }),
              screenshot_url: imageUrls[screenId] || null
            };
          });
          
          console.log('✅ Screenshots exportés avec succès');
          sendJsonResponse(res, screensWithImages);
        } catch (error) {
          console.error('❌ Erreur lors de l\'export des screenshots:', error);
          sendJsonResponse(res, { error: error.message }, 500);
        }
      })();
    } catch (error) {
      console.error('Erreur:', error);
      sendJsonResponse(res, { error: 'Erreur de parsing JSON' }, 400);
    }
    return;
  }
  
  // Route non trouvée
  sendJsonResponse(res, { error: 'Not Found' }, 404);
});

// Démarrer le serveur
server.listen(port, () => {
  console.log(`🚀 Serveur MCP démarré sur http://localhost:${port}/mcp`);
  console.log(`📋 Outils disponibles: ${mcpConfig.tools.join(', ')}`);
});
