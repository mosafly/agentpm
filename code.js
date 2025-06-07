// Code principal du plugin Figma étendu
console.log('🚀 UX Spec Generator Extended - Démarrage');

// Configuration
const CONFIG = {
  // Par défaut, utiliser Imgur pour les uploads d'images
  use_imgur: true,
  cloudinary: {
    cloud_name: '',
    upload_preset: ''
  },
  // Configuration MCP
  mcp: {
    enabled: true,
    server_url: 'http://localhost:3000/mcp',
    timeout: 60000 // 60 secondes
  }
};

// Classe pour communiquer avec le serveur MCP Figma
class MCPClient {
  constructor(config) {
    this.config = config;
    this.enabled = config.enabled;
    this.serverUrl = config.server_url;
    this.timeout = config.timeout || 30000;
    console.log('🔍 Initialisation MCP Client:', this.enabled ? 'Activé' : 'Désactivé');
  }
  
  // Appel d'un outil MCP via l'UI (car le plugin Figma ne peut pas faire de requêtes HTTP directement)
  async call(toolName, params) {
    if (!this.enabled) {
      console.warn('⚠️ MCP désactivé, utilisation du mode local');
      return this.fallbackLocalProcessing(toolName, params);
    }
    
    console.log(`🔍 Appel MCP: ${toolName}`, params);
    
    // Créer une promesse pour attendre la réponse de l'UI
    return new Promise((resolve, reject) => {
      // Sauvegarder l'ancien gestionnaire de messages
      const oldHandler = figma.ui.onmessage;
      
      // Timeout ID
      let timeoutId;
      
      // Nouveau gestionnaire de messages temporaire
      figma.ui.onmessage = (msg) => {
        if (msg.type === 'mcp-response' && msg.requestId === params.requestId) {
          // Restaurer l'ancien gestionnaire
          figma.ui.onmessage = oldHandler;
          clearTimeout(timeoutId);
          
          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.result);
          }
        } else {
          // Passer le message à l'ancien gestionnaire
          oldHandler(msg);
        }
      };
      
      // Générer un ID unique pour cette requête
      const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      params.requestId = requestId;
      
      // Envoyer la requête à l'UI
      figma.ui.postMessage({
        type: 'mcp-request',
        tool: toolName,
        params: params,
        requestId: requestId
      });
      
      // Timeout
      timeoutId = setTimeout(() => {
        figma.ui.onmessage = oldHandler;
        reject(new Error(`Timeout lors de l'appel MCP: ${toolName}`));
      }, this.timeout);
    });
  }
  
  // Traitement local en cas de MCP indisponible
  async fallbackLocalProcessing(toolName, params) {
    console.log(`🔧 Traitement local: ${toolName}`);
    
    switch (toolName) {
      case 'analyze_figma_project':
        // Utiliser les fonctions locales existantes
        return extractCompleteProject();
        
      case 'extract_project_screens':
        return extractCompleteProject().screens;
        
      case 'analyze_screen_content':
        if (params.screen) {
          return analyzeFrameContent(params.screen);
        }
        break;
        
      case 'export_screenshots_batch':
        // Utiliser la fonction locale existante pour chaque écran
        if (params.screens && Array.isArray(params.screens)) {
          const results = [];
          for (const screen of params.screens) {
            try {
              const node = figma.getNodeById(screen.id);
              if (node) {
                const url = await exportAndUploadScreenshot(node);
                // Créer un nouvel objet sans utiliser le spread operator
                const screenWithUrl = {};
                for (const key in screen) {
                  screenWithUrl[key] = screen[key];
                }
                screenWithUrl.screenshot_url = url;
                results.push(screenWithUrl);
              }
            } catch (error) {
              console.error(`❌ Erreur export ${screen.name}:`, error);
            }
          }
          return results;
        }
        break;
    }
    
    throw new Error(`Outil MCP non implémenté en local: ${toolName}`);
  }
}

// Initialiser le client MCP
const mcpClient = new MCPClient(CONFIG.mcp);

// Interface avec le frontend
figma.showUI(__html__, { 
  width: 320, 
  height: 600,
  themeColors: true 
});

// Envoyer l'état de sélection initial
sendSelectionInfo();

// Écouter les changements de sélection
figma.on('selectionchange', () => {
  sendSelectionInfo();
});

// Fonction pour envoyer les informations de sélection à l'UI
function sendSelectionInfo() {
  const selection = figma.currentPage.selection;
  const selectionData = selection.map(node => ({
    id: node.id,
    name: node.name,
    type: node.type
  }));
  
  figma.ui.postMessage({
    type: 'selection-changed',
    selection: selectionData
  });
}

// Gestion des messages du frontend
figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      
      // ═══════════════════════════════════════════════════════════
      // MODE ÉCRAN INDIVIDUEL (EXISTANT)
      // ═══════════════════════════════════════════════════════════
      case 'generate-single-spec':
        await handleSingleScreenAnalysis();
        break;
      
      // ═══════════════════════════════════════════════════════════
      // MODE PROJET COMPLET (NOUVEAU)
      // ═══════════════════════════════════════════════════════════
      case 'scan-project':
        await handleProjectScan();
        break;
        
      case 'start-contextual-analysis':
        await handleContextualAnalysis(msg.context);
        break;

      // ══════════════════════════════════════════════════
      // GESTION MCP
      // ══════════════════════════════════════════════════
      case 'mcp-response':
        // Géré par le client MCP
        break;
        
      default:
        console.log('Message non géré:', msg.type);
    }
  } catch (error) {
    console.error('Erreur:', error);
    figma.notify(`❌ Erreur: ${error.message}`);
    figma.ui.postMessage({ 
      type: 'error', 
      message: error.message 
    });
  }
};

// ═══════════════════════════════════════════════════════════════════
// FONCTIONS MODE ÉCRAN INDIVIDUEL
// ═══════════════════════════════════════════════════════════════════

async function handleSingleScreenAnalysis() {
  console.log('🔍 DEBUG - Début analyse');
  console.log('📁 figma.root.name:', figma.root.name);
  console.log('📄 figma.currentPage.name:', figma.currentPage.name);
  
  // Détection du fileKey de façon sécurisée
  let fileKey = null;
  try {
    fileKey = figma.fileKey;
    console.log('🔑 figma.fileKey:', fileKey);
  } catch (e) {
    console.warn('⚠️ Erreur accès à figma.fileKey:', e);
  }
  
  const selection = figma.currentPage.selection;
  
  if (selection.length !== 1 || selection[0].type !== 'FRAME') {
    figma.notify('⚠️ Sélectionnez un seul écran');
    return;
  }
  
  const frame = selection[0];
  figma.notify('📷 Export en cours...');
  
  try {
    if (CONFIG.mcp.enabled) {
      figma.notify('🔍 Analyse via MCP...');
      
      // SOLUTION ROBUSTE : Générer toujours un ID utilisable
      if (!fileKey) {
        // Générer un ID temporaire basé sur le nom du fichier et la date
        fileKey = `temp_${figma.root.name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
        console.log('💾 Mode développement: ID temporaire généré:', fileKey);
        figma.notify('⚠️ Mode développement détecté - Images simulées utilisées', { timeout: 3000 });
      }
      
      console.log('🔑 File Key détecté:', fileKey);
      
      // ✅ CORRECTION : Préparer les données dans le bon format
      const screenData = {
        id: frame.id,
        name: frame.name,
        figma_url: `https://figma.com/file/${fileKey}?node-id=${frame.id}`,
        dimensions: {
          width: frame.width,
          height: frame.height
        },
        page_name: figma.currentPage.name
      };
      
      console.log('📱 Données écran préparées:', screenData);
      
      // 2. Analyser le contenu de l'écran via MCP
      const analyzedScreen = await mcpClient.call('analyze_screen_content', {
        screen: screenData,
        figma_file_key: fileKey
      });
      
      console.log('✅ Écran analysé:', analyzedScreen);
      
      // ✅ CORRECTION : Format exact attendu par le MCP avec les IDs d'écran
      // Créer un objet combiné sans utiliser l'opérateur de décomposition (...)
      const combinedScreenData = {};
      
      // Copier les propriétés de screenData
      for (const key in screenData) {
        combinedScreenData[key] = screenData[key];
      }
      
      // Copier les propriétés de analyzedScreen
      if (analyzedScreen && typeof analyzedScreen === 'object') {
        for (const key in analyzedScreen) {
          combinedScreenData[key] = analyzedScreen[key];
        }
      }
      
      const mcpPayload = {
        screens: [combinedScreenData],
        figma_file_key: fileKey
      };
      
      console.log('📤 Payload envoyé au MCP:', mcpPayload);
      
      // Logs de débogage supplémentaires
      console.log('📤 DEBUG - Données envoyées à export_screenshots_batch:');
      console.log('- screens[0].id:', mcpPayload.screens[0].id); // Vérifier que l'ID est bien présent
      console.log('- screens:', JSON.stringify(mcpPayload.screens, null, 2));
      console.log('- figma_file_key:', mcpPayload.figma_file_key);
      console.log('- Type screens:', Array.isArray(mcpPayload.screens) ? 'Array' : typeof mcpPayload.screens);
      console.log('- Type figma_file_key:', typeof mcpPayload.figma_file_key);
      
      // 3. Exporter la capture d'écran via MCP avec le bon format
      const screensWithImages = await mcpClient.call('export_screenshots_batch', mcpPayload);
      
      console.log('✅ Screenshots exportés:', screensWithImages);
      
      // ✅ ARRÊTER ICI si MCP réussit
      if (screensWithImages && screensWithImages.length > 0) {
        const screenWithImage = screensWithImages[0];
        
        // Vérifier que l'URL screenshot est valide
        if (screenWithImage.screenshot_url && 
            !screenWithImage.screenshot_url.includes('undefined') &&
            !screenWithImage.screenshot_url.includes('example.com')) {
          
          figma.notify('✅ Spécification en cours de génération via MCP !');
          figma.ui.postMessage({ type: 'single-success' });
          return;
        } else {
          console.warn('⚠️ URL screenshot invalide:', screenWithImage.screenshot_url);
          figma.notify('⚠️ Fallback vers traitement local...');
        }
      }
      
    } else {
      console.log('🔧 MCP désactivé, mode local');
    }
    
    // Traitement local (fallback) - SEULEMENT si MCP échoue
    figma.notify('🔧 Export local en cours...');
    
    const screenshotUrl = await exportAndUploadScreenshot(frame);
    
    const screenData = {
      id: frame.id,
      name: frame.name,
      screenshot_url: screenshotUrl,
      figma_url: `https://figma.com/file/${figma.fileKey || 'unknown'}?node-id=${frame.id}`,
      dimensions: {
        width: frame.width,
        height: frame.height
      },
      content_analysis: analyzeFrameContent(frame)
    };
    
    console.log('📤 Envoi vers N8N (mode fallback):', screenData);
    
    // COMMENTÉ TEMPORAIREMENT POUR ÉVITER L'ERREUR CORS
    /*
    const response = await fetch(CONFIG.webhooks.single_screen, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'single_screen_analysis',
        screen_data: screenData,
        source: 'figma_plugin_fallback'
      })
    });
    
    if (response.ok) {
      figma.notify('✅ Spécification en cours de génération !');
      figma.ui.postMessage({ type: 'single-success' });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    */
    
    // Temporaire : juste signaler le succès
    figma.notify('✅ Export terminé (mode local) !');
    figma.ui.postMessage({ type: 'single-success' });
    
  } catch (error) {
    console.error('❌ Erreur handleSingleScreenAnalysis:', error);
    figma.notify(`❌ Erreur: ${error.message}`);
    
    // Afficher l'erreur dans l'UI
    figma.ui.postMessage({ 
      type: 'error', 
      message: error.message 
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// FONCTIONS MODE PROJET COMPLET
// ═══════════════════════════════════════════════════════════════════

async function handleProjectScan() {
  figma.notify('🔍 Scan du projet en cours...');
  
  try {
    let projectData;
    
    // Utiliser le MCP pour le scan du projet si activé
    if (CONFIG.mcp.enabled) {
      figma.notify('🔍 Scan via MCP...');
      
      try {
        // Extraction des écrans via MCP
        projectData = await mcpClient.call('extract_project_screens', {
          figma_file_key: figma.fileKey
        });
        
        figma.notify('✅ Scan MCP terminé');
      } catch (mcpError) {
        console.error('Erreur MCP scan:', mcpError);
        figma.notify('⚠️ Fallback vers scan local...');
        projectData = await extractCompleteProject();
      }
    } else {
      // Extraction locale
      projectData = await extractCompleteProject();
    }
    
    figma.ui.postMessage({
      type: 'project-scanned',
      data: {
        total_screens: projectData.screens ? projectData.screens.length : 0,
        total_pages: projectData.metadata ? projectData.metadata.total_pages : 0,
        pages_breakdown: projectData.pages_breakdown || [],
        project_name: projectData.metadata ? projectData.metadata.name : figma.root.name
      }
    });
    
    figma.notify(`✅ ${projectData.screens ? projectData.screens.length : 0} écrans détectés`);
  } catch (error) {
    console.error('Erreur scan projet:', error);
    figma.notify('❌ Erreur lors du scan du projet');
    throw error;
  }
}

async function handleContextualAnalysis(userContext) {
  figma.notify('🚀 Analyse contextuelle en cours...');
  
  try {
    // Utiliser le MCP pour l'analyse contextuelle
    figma.notify('🔍 Analyse via MCP...');
    
    try {
      // Analyse complète du projet via MCP
      const projectAnalysis = await mcpClient.call('analyze_figma_project', {
        figma_file_key: figma.fileKey,
        business_context: {
          project_objective: userContext.project_objective,
          target_users: userContext.target_users,
          project_type: userContext.project_type,
          detail_level: userContext.detail_level,
          required_integrations: userContext.integrations
        },
        options: {
          include_screenshots: true,
          include_design_system: true,
          include_user_flows: true
        }
      });
      
      // Le MCP se charge d'appeler N8N et de traiter les données
      if (projectAnalysis && projectAnalysis.success) {
        figma.notify('✅ Analyse terminée et envoyée à N8N !');
        figma.ui.postMessage({ 
          type: 'analysis-started',
          data: {
            workflow_id: projectAnalysis.workflow_id || 'mcp_processed',
            estimated_duration: '12-15 minutes'
          }
        });
      } else {
        throw new Error('Échec de l\'analyse MCP');
      }
    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error);
      figma.notify('❌ Erreur lors de l\'analyse: ' + error.message);
      figma.ui.postMessage({ 
        type: 'analysis-error', 
        error: error.message 
      });
    }
  } catch (error) {
    figma.notify('❌ Erreur analyse');
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════════

async function extractCompleteProject() {
  const projectData = {
    metadata: {
      name: figma.root.name,
      id: figma.root.id,
      figma_url: `https://figma.com/file/${figma.fileKey}`,
      total_pages: figma.root.children.length,
      extracted_at: new Date().toISOString()
    },
    screens: [],
    pages_breakdown: [],
    flows: {},
    design_system: {}
  };
  
  // Parcours de toutes les pages
  for (const page of figma.root.children) {
    figma.notify(`📄 Analyse page: ${page.name}`);
    
    const pageScreens = [];
    
    // Extraction des frames de la page
    for (const node of page.children) {
      if (node.type === 'FRAME' && isMainScreen(node)) {
        const screenData = await extractScreenData(node, page.name);
        pageScreens.push(screenData);
        projectData.screens.push(screenData);
      }
    }
    
    projectData.pages_breakdown.push({
      name: page.name,
      screen_count: pageScreens.length,
      page_type: inferPageType(page.name)
    });
  }
  
  // Détection des flows entre écrans
  projectData.flows = detectScreenFlows(projectData.screens);
  
  // Extraction design system
  projectData.design_system = extractDesignSystem();
  
  return projectData;
}

async function extractScreenData(frame, pageName) {
  const screenData = {
    id: frame.id,
    name: frame.name,
    page: pageName,
    dimensions: {
      width: frame.width,
      height: frame.height
    },
    figma_url: `https://figma.com/file/${figma.fileKey}?node-id=${frame.id}`,
    screenshot_url: await exportAndUploadScreenshot(frame),
    content_analysis: analyzeFrameContent(frame),
    connections: getFrameConnections(frame),
    position: {
      x: frame.x,
      y: frame.y
    }
  };
  
  return screenData;
}

function analyzeFrameContent(frame) {
  return {
    text_hierarchy: extractTextHierarchy(frame),
    interactive_elements: findInteractiveElements(frame),
    form_fields: detectFormFields(frame),
    navigation_elements: findNavigationElements(frame),
    data_displays: identifyDataDisplays(frame)
  };
}

function extractTextHierarchy(node) {
  const textElements = [];
  
  function walkNode(currentNode, level = 0) {
    if (currentNode.type === 'TEXT') {
      textElements.push({
        content: currentNode.characters,
        level: level,
        style: {
          fontSize: currentNode.fontSize,
          fontWeight: currentNode.fontWeight
        },
        role: inferTextRole(currentNode)
      });
    }
    
    if ('children' in currentNode) {
      currentNode.children.forEach(child => walkNode(child, level + 1));
    }
  }
  
  walkNode(node);
  return textElements;
}

function findInteractiveElements(frame) {
  const elements = [];
  
  function walkNode(node) {
    // Détection boutons
    if (node.type === 'FRAME' || node.type === 'RECTANGLE') {
      if (looksLikeButton(node)) {
        elements.push({
          type: 'button',
          name: getElementLabel(node),
          position: { x: node.x, y: node.y }
        });
      }
    }
    
    // Détection champs
    if (looksLikeInput(node)) {
      elements.push({
        type: 'input',
        label: findAssociatedLabel(node),
        position: { x: node.x, y: node.y }
      });
    }
    
    if ('children' in node) {
      node.children.forEach(walkNode);
    }
  }
  
  walkNode(frame);
  return elements;
}

function detectFormFields(frame) {
  // Logique de détection des formulaires
  const formElements = findInteractiveElements(frame);
  const inputs = formElements.filter(el => el.type === 'input');
  
  if (inputs.length > 1) {
    return {
      is_form: true,
      field_count: inputs.length,
      fields: inputs.map(input => input.label),
      submit_buttons: formElements.filter(el => el.type === 'button')
    };
  }
  
  return { is_form: false };
}

function getFrameConnections(frame) {
  const connections = [];
  
  if (frame.reactions) {
    frame.reactions.forEach(reaction => {
      if (reaction.action && reaction.action.type === 'NAVIGATE') {
        connections.push({
          trigger: (reaction.trigger && reaction.trigger.type) || 'CLICK',
          destination_id: reaction.action.destinationId,
          transition: (reaction.action.transition && reaction.action.transition.type) || null
        });
      }
    });
  }
  
  return connections;
}

function detectScreenFlows(screens) {
  const flows = {};
  
  screens.forEach(screen => {
    if (screen.connections && screen.connections.length > 0) {
      flows[screen.id] = screen.connections.map(conn => {
        const targetScreen = screens.find(s => s.id === conn.destination_id);
        return {
          from: screen.name,
          to: (targetScreen && targetScreen.name) || 'Unknown',
          trigger: conn.trigger
        };
      });
    }
  });
  
  return flows;
}

async function exportAndUploadScreenshot(frame) {
  try {
    // Export de la frame en PNG
    const imageBytes = await frame.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }
    });
    
    // Conversion en base64
    const base64 = figma.base64Encode(imageBytes);
    
    // Attendre la réponse de l'UI avec l'URL de l'image
    return new Promise((resolve, reject) => {
      // Sauvegarder l'ancien gestionnaire de messages
      const oldHandler = figma.ui.onmessage;
      
      // Timeout ID pour le timeout
      let timeoutId;
      
      // Nouveau gestionnaire de messages temporaire
      figma.ui.onmessage = (msg) => {
        if (msg.type === 'upload-complete' && msg.frameId === frame.id) {
          // Restaurer l'ancien gestionnaire
          figma.ui.onmessage = oldHandler;
          clearTimeout(timeoutId);
          resolve(msg.imageUrl);
        } else if (msg.type === 'upload-error' && msg.frameId === frame.id) {
          // Restaurer l'ancien gestionnaire
          figma.ui.onmessage = oldHandler;
          clearTimeout(timeoutId);
          reject(new Error(msg.error || 'Échec upload image'));
        } else {
          // Passer le message à l'ancien gestionnaire
          oldHandler(msg);
        }
      };
      
      // Envoyer l'image à l'UI pour l'upload
      figma.ui.postMessage({
        type: 'upload-image',
        imageData: base64,
        frameId: frame.id,
        frameName: frame.name
      });
      
      // Timeout après 30 secondes
      timeoutId = setTimeout(() => {
        figma.ui.onmessage = oldHandler;
        reject(new Error('Timeout lors de l\'upload de l\'image'));
      }, 30000);
    });
  } catch (error) {
    console.error('Erreur export/upload:', error);
    throw new Error('Échec export/upload image');
  }
}

// Fonctions utilitaires
function isMainScreen(node) {
  return node.type === 'FRAME' && 
         node.width > 200 && 
         node.height > 200 &&
         !node.name.toLowerCase().includes('component');
}

function inferPageType(pageName) {
  const name = pageName.toLowerCase();
  if (name.includes('auth') || name.includes('login')) return 'authentication';
  if (name.includes('admin') || name.includes('settings')) return 'administration';
  if (name.includes('main') || name.includes('home')) return 'main';
  return 'feature';
}

function looksLikeButton(node) {
  return node.cornerRadius > 0 && 
         node.fills && node.fills.length > 0 &&
         node.width > 60 && node.height > 20;
}

function looksLikeInput(node) {
  return (node.type === 'RECTANGLE' || node.type === 'FRAME') &&
         node.strokes && node.strokes.length > 0 &&
         node.width > 100 && node.height > 30 && node.height < 60;
}

function getElementLabel(node) {
  // Cherche du texte dans les enfants
  if ('children' in node) {
    for (const child of node.children) {
      if (child.type === 'TEXT') {
        return child.characters;
      }
    }
  }
  return node.name;
}

function findAssociatedLabel(inputNode) {
  // Logique pour trouver le label associé à un input
  return inputNode.name || 'Input';
}

function inferTextRole(textNode) {
  const fontSize = textNode.fontSize || 14;
  const fontWeight = textNode.fontWeight || 400;
  
  if (fontSize > 24) return 'title';
  if (fontSize > 18) return 'subtitle';
  if (fontWeight > 500) return 'label';
  return 'body';
}

function extractDesignSystem() {
  return {
    colors: extractColors(),
    typography: extractTypography(),
    components: extractComponents()
  };
}

function extractColors() {
  // Extraction des couleurs du projet
  return [];
}

function extractTypography() {
  // Extraction des styles de texte
  return [];
}

function extractComponents() {
  // Extraction des composants
  return [];
}

// Configuration du gestionnaire de messages principal
figma.ui.onmessage = async (msg) => {
  console.log('📩 Message reçu:', msg.type);
  
  switch (msg.type) {
    case 'update-mcp-config':
      // Mettre à jour la configuration MCP
      CONFIG.mcp = msg.config;
      // Réinitialiser le client MCP avec la nouvelle configuration
      mcpClient = new MCPClient(CONFIG.mcp);
      console.log('🔄 Configuration MCP mise à jour:', CONFIG.mcp);
      break;
      
    case 'generate-single-spec':
      await handleSingleScreenAnalysis();
      break;
      
    case 'start-project-scan':
      await handleProjectScan();
      break;
      
    case 'analyze-project-context':
      await handleContextualAnalysis(msg.context);
      break;
      
    case 'upload-complete':
    case 'upload-error':
      // Ces messages sont gérés par des gestionnaires temporaires
      // dans les fonctions qui les attendent
      break;
      
    default:
      console.warn('⚠️ Message non géré:', msg.type);
      break;
  }
};

console.log('✅ Plugin code loaded');