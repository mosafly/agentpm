// Code principal du plugin Figma étendu
console.log('🚀 Agent PM - Démarrage');

// Configuration
const CONFIG = {
  // Configuration Cloudinary
  cloudinary: {
    cloud_name: 'du9e3f5rh', // Valeur par défaut
    upload_preset: 'ux-specs-preset' // Valeur par défaut
  },
  // Configuration n8n
  n8n: {
    webhook_url: 'http://localhost:5678/webhook/figma-analysis', // URL du webhook n8n
    timeout: 60000 // 60 secondes
  }
};

// Classe pour communiquer avec n8n via webhook
class N8nClient {
  constructor(config) {
    this.webhookUrl = config.webhook_url;
    this.timeout = config.timeout || 30000;
    console.log('🔍 Initialisation N8n Client');
  }
  
  // Envoi des données à n8n
  async sendToN8n(data) {
    console.log(`🔄 Envoi à n8n`);
    
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Erreur n8n HTTP ${response.status}: ${errorText}`);
        throw new Error(`Erreur n8n: ${response.status}`);
      }
      
      const responseData = await response.json();
      console.log(`✅ Réponse n8n reçue`);
      return responseData;
      
    } catch (error) {
      console.error(`❌ Erreur n8n: ${error.message}`);
      throw error;
    }
  }
}

// Initialiser le client n8n
const n8nClient = new N8nClient(CONFIG.n8n);

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

// Configuration du gestionnaire de messages principal
figma.ui.onmessage = async (msg) => {
  console.log('📩 Message reçu:', msg.type);
  
  try {
    switch (msg.type) {
      // Scan du projet
      case 'scan-project':
        console.log('Démarrage du scan du projet...');
        const projectData = await handleProjectScan();
        break;
        
      // Autres messages...
      case 'generate-single-spec':
        await handleSingleScreenAnalysis();
        break;
        
      case 'start-contextual-analysis':
        await handleContextualAnalysis(msg.context);
        break;
        
      default:
        console.warn('⚠️ Message non géré:', msg.type);
    }
  } catch (error) {
    console.error('Erreur dans le gestionnaire de messages:', error);
    figma.notify(`❌ Erreur: ${error.message}`);
    figma.ui.postMessage({ 
      type: 'error', 
      message: error.message 
    });
  }
};

// S'assurer que la fonction onmessage est correctement exportée
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { onmessage };
}

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
    
    // Envoi des données à n8n
    const response = await n8nClient.sendToN8n({
      type: 'single_screen_analysis',
      screen_data: screenData,
      source: 'figma_plugin_fallback'
    });
    
    if (response.ok) {
      figma.notify('✅ Spécification en cours de génération !');
      figma.ui.postMessage({ type: 'single-success' });
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    
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
    // Extraction locale des écrans et envoi à l'UI
    const projectData = await extractCompleteProject();
    
    figma.notify('✅ Extraction des écrans terminée, préparation pour upload...');
    
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
      const projectAnalysis = await n8nClient.sendToN8n({
        type: 'contextual_analysis',
        project_data: {
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
  figma.notify('🔍 Analyse de la page active en cours...');
  
  const projectData = {
    metadata: {
      name: figma.root.name,
      id: figma.root.id,
      figma_file_key: figma.fileKey,
      figma_url: `https://figma.com/file/${figma.fileKey}`,
      total_pages: 1, // Seulement la page active
      extracted_at: new Date().toISOString(),
      current_page: figma.currentPage.name
    },
    screens: []
  };
  
  // Analyse uniquement de la page active
  const currentPage = figma.currentPage;
  figma.notify(`📄 Analyse page: ${currentPage.name}`);
  
  // Extraction des frames de la page active
  for (const node of currentPage.children) {
    if (node.type === 'FRAME' && isMainScreen(node)) {
      try {
        // Exporter l'image en PNG
        const bytes = await node.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 2 } // Haute résolution
        });
        
        // Convertir ArrayBuffer en base64
        const base64Image = arrayBufferToBase64(bytes);
        
        // Ajouter à la liste des écrans
        projectData.screens.push({
          id: node.id,
          name: node.name,
          page: currentPage.name,
          width: node.width,
          height: node.height,
          image: `data:image/png;base64,${base64Image}`
        });
      } catch (error) {
        console.error(`Erreur export ${node.name}:`, error);
      }
    }
  }
  
  // Envoyer à l'UI pour upload Cloudinary
  figma.ui.postMessage({
    type: 'upload-screens',
    screens: projectData.screens,
    project: {
      name: projectData.metadata.name,
      file_key: projectData.metadata.figma_file_key
    }
  });
  
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

// Fonction pour convertir un ArrayBuffer en base64
function arrayBufferToBase64(buffer) {
  return figma.base64Encode(buffer);
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

console.log('✅ Plugin code loaded');