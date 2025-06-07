# Plugin Figma Agent PM - Documentation Complète

## Vue d'ensemble

Ce projet est un écosystème complet pour l'analyse et l'exportation de projets Figma, composé de trois composants principaux :

1. **Plugin Figma** : Interface utilisateur dans Figma pour analyser les designs
2. **Serveur MCP** : Serveur Model Context Protocol qui expose des outils d'analyse Figma et intègre GPT-4o Vision
3. **Workflow N8N** : Automatisation pour la génération de spécifications à partir des analyses Figma et création d'artefacts dans Tuleap

## Architecture du système

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Plugin Figma │───►│ Serveur MCP │───►│ GPT-4o     │───►│ Workflow N8N│
└─────────────┘    └─────────────┘    │ Vision AI   │    └─────────────┘
       │                  │           └─────────────┘          │
       ▼                  ▼                                    ▼
┌─────────────┐    ┌─────────────┐                      ┌─────────────┐
│  API Figma  │    │  Cloudinary │                      │   Tuleap    │
│             │    │  (Images)   │                      │  (Gestion   │
│             │    │             │                      │  de projet) │
└─────────────┘    └─────────────┘                      └─────────────┘
```

## Composant 1 : Plugin Figma

### Fonctionnalités
- Interface utilisateur pour sélectionner les frames/écrans à analyser
- Visualisation des résultats d'analyse
- Export des spécifications et captures d'écran
- Détection des flows utilisateur
- Communication avec le serveur MCP local

### Installation
1. Ouvrez Figma et accédez à `Menu > Plugins > Development > Import plugin from manifest`
2. Sélectionnez le fichier `manifest.json` du projet

### Configuration
Le plugin communique avec le serveur MCP via HTTP. Configuration dans `code.js` :

```javascript
// Configuration du plugin
const CONFIG = {
  webhooks: {
    single_screen: 'http://localhost:5678/webhook-test/generate-spec',
    complete_project: 'http://localhost:5678/webhook-test/contextual-project-analysis'
  },
  mcp: {
    enabled: true,
    server_url: 'http://localhost:3000/mcp',
    timeout: 60000 // 60 secondes
  }
};
```

### Workflow d'utilisation
1. L'utilisateur ouvre le plugin dans Figma
2. Sélection des frames/écrans à analyser ou analyse du projet complet
3. Le plugin envoie les données au serveur MCP
4. Affichage des résultats d'analyse
5. Option d'export des spécifications via N8N

## Composant 2 : Serveur MCP (Model Context Protocol)

### Outils exposés
- **analyze_figma_project** : Analyse complète d'un projet Figma avec GPT-4o Vision
- **extract_project_screens** : Extraction des écrans d'un projet
- **analyze_screen_content** : Analyse détaillée du contenu d'un écran
- **export_screenshots_batch** : Export en lot des captures d'écran
- **detect_user_flows** : Détection des flux utilisateur
- **extract_design_system** : Extraction du design system

### Installation

#### Prérequis
- Node.js (v14 ou supérieur)
- Compte Figma avec token API
- Compte OpenAI avec accès à GPT-4o Vision
- Compte Cloudinary (optionnel)
- Instance N8N (locale ou hébergée)
- Instance Tuleap (optionnelle)

#### Étapes d'installation
1. Clonez le dépôt :
   ```
   git clone <votre-repo>
   cd Plugin-Figma-agent-PM
   ```

2. Installez les dépendances :
   ```
   npm install
   ```

3. Configurez le fichier `.env` à la racine du projet :
   ```
   # Configuration du serveur MCP
   MCP_PORT=3000
   DEBUG=true
   REQUEST_TIMEOUT=30000
   
   # API Figma
   FIGMA_TOKEN=your_figma_token_here
   
   # API OpenAI pour GPT-4o Vision
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Webhook N8N
   N8N_WEBHOOK_URL=http://localhost:5678/webhook-test/contextual-project-analysis
   N8N_API_KEY=
   
   # Configuration Cloudinary (optionnel)
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   CLOUDINARY_UPLOAD_PRESET=
   ```

### Démarrage du serveur
```
node mcp_server.js
```
Le serveur sera accessible à l'adresse : `http://localhost:3000/mcp`

### Workflow de traitement
1. Réception des requêtes du plugin Figma
2. Authentification avec l'API Figma
3. Extraction et analyse des données de design
4. Récupération des images des écrans via l'API Figma
5. Analyse des designs avec GPT-4o Vision (texte + images)
6. Upload des captures d'écran sur Cloudinary (optionnel)
7. Envoi des données analysées au workflow N8N
8. Retour des résultats au plugin Figma

## Composant 3 : Workflow N8N

### Fonctionnalités
- Réception des données d'analyse Figma via webhook
- Traitement et enrichissement des données avec contexte business
- Utilisation de GPT-4o comme agent Product Manager
- Génération de spécifications techniques et fonctionnelles
- Création automatisée d'artefacts dans Tuleap (Epics, Features, User Stories)
- Calcul de complexité et estimation d'effort

### Installation de N8N

#### Option 1 : Installation locale
```bash
# Installation via npm
npm install n8n -g

# Démarrage du serveur N8N
n8n start
```

#### Option 2 : Installation avec Docker
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### Configuration du workflow N8N

1. Accédez à l'interface N8N : `http://localhost:5678`
2. Importez le workflow depuis le fichier `N8N.json`
3. Configurez les credentials pour OpenAI (GPT-4o)
4. Configurez les webhooks pour recevoir les données du serveur MCP
5. Configurez l'intégration avec Tuleap (si applicable)

### Workflow de traitement N8N
1. Réception des données via webhook `/webhook-test/contextual-project-analysis`
2. Validation et enrichissement des données avec contexte business
3. Analyse par GPT-4o agissant comme un Product Manager senior
4. Génération de spécifications structurées (Epics, Features, User Stories)
5. Création d'artefacts dans Tuleap avec métadonnées contextuelles
6. Calcul de complexité et estimation d'effort

## Intégration GPT-4o Vision

### Fonctionnalités
- Analyse multimodale des designs Figma (texte + images)
- Compréhension profonde des interfaces utilisateur
- Détection des patterns de design et des composants
- Analyse contextuelle basée sur les objectifs business
- Génération de recommandations d'implémentation

### Configuration
La fonction `analyzeWithGPT4oVision` dans le serveur MCP utilise l'API OpenAI pour envoyer à la fois les données structurelles du design et les images des écrans à GPT-4o Vision.

## Flux de données complet

1. **Plugin Figma** → Sélection des écrans ou projet complet à analyser
2. **Plugin Figma** → Envoi des données au serveur MCP (clé de fichier, contexte business)
3. **Serveur MCP** → Récupération des données détaillées via l'API Figma
4. **Serveur MCP** → Extraction des écrans, composants et styles
5. **Serveur MCP** → Récupération des images des écrans via l'API Figma
6. **Serveur MCP** → Envoi des données et images à GPT-4o Vision pour analyse
7. **GPT-4o Vision** → Analyse multimodale et génération de résultats structurés
8. **Serveur MCP** → Envoi des résultats d'analyse au webhook N8N
9. **N8N Workflow** → Traitement des données avec l'agent PM (GPT-4o)
10. **N8N Workflow** → Génération de spécifications détaillées
11. **N8N Workflow** → Création d'artefacts dans Tuleap
12. **Serveur MCP** → Retour des résultats au plugin Figma

## Configuration de l'environnement de développement

### Prérequis
- Node.js (v14 ou supérieur)
- Compte Figma avec token API
- Compte OpenAI avec accès à GPT-4o Vision
- Compte Cloudinary (optionnel)
- Instance N8N (locale ou hébergée)
- Instance Tuleap (optionnelle)

### Variables d'environnement
Toutes les variables d'environnement sont configurées dans le fichier `.env` :
- `MCP_PORT` : Port du serveur MCP (défaut: 3000)
- `FIGMA_TOKEN` : Token API Figma
- `OPENAI_API_KEY` : Clé API OpenAI pour GPT-4o Vision
- `N8N_WEBHOOK_URL` : URL du webhook N8N
- `CLOUDINARY_*` : Credentials Cloudinary (optionnel)

## Dépannage

### Problèmes courants et solutions

#### Le plugin Figma ne se connecte pas au serveur MCP
- Vérifiez que le serveur MCP est bien démarré sur le port 3000
- Vérifiez que les URLs dans le plugin pointent vers le bon serveur
- Assurez-vous que le plugin a accès au serveur local (problèmes CORS)

#### Le serveur MCP ne peut pas accéder à l'API Figma
- Vérifiez que le token Figma est valide et correctement configuré
- Assurez-vous que le token a les permissions nécessaires

#### L'analyse GPT-4o Vision échoue
- Vérifiez que la clé API OpenAI est valide
- Assurez-vous que vous avez accès au modèle GPT-4o Vision
- Vérifiez les logs pour les messages d'erreur détaillés

#### N8N ne reçoit pas les données du webhook
- Vérifiez que N8N est démarré et accessible sur le port 5678
- Assurez-vous que les URLs des webhooks sont correctes
- Vérifiez que le serveur MCP peut accéder à N8N

#### Les artefacts ne sont pas créés dans Tuleap
- Vérifiez la configuration de l'intégration Tuleap dans N8N
- Assurez-vous que les credentials sont corrects
- Vérifiez les logs N8N pour les erreurs d'API

## Ressources additionnelles

- [Documentation API Figma](https://www.figma.com/developers/api)
- [Documentation OpenAI GPT-4o Vision](https://platform.openai.com/docs/guides/vision)
- [Documentation N8N](https://docs.n8n.io/)
- [Documentation Tuleap](https://docs.tuleap.org/)

## Mise à jour et maintenance

### Mise à jour du plugin Figma
1. Modifiez les fichiers du plugin
2. Rechargez le plugin dans Figma via le menu développeur

### Mise à jour du serveur MCP
1. Mettez à jour le code du serveur
2. Redémarrez le serveur MCP

### Mise à jour du workflow N8N
1. Modifiez le workflow dans l'interface N8N
2. Exportez le workflow mis à jour si nécessaire

## Licence

Ce projet est sous licence [MIT](LICENSE).
