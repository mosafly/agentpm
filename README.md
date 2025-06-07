# Plugin Figma Agent PM - Documentation Complète

## Vue d'ensemble

Ce projet est un écosystème complet pour l'analyse et l'exportation de projets Figma, composé de deux composants principaux :

1. **Plugin Figma** : Interface utilisateur dans Figma pour analyser les designs et uploader les images directement vers Cloudinary
2. **Workflow N8N** : Automatisation pour la génération de spécifications à partir des analyses Figma avec GPT-4o Vision et création d'artefacts dans Tuleap

## Architecture du système

```
┬───────────┬    ┬───────────┬    ┬───────────┬
│ Plugin Figma │───►│ Cloudinary  │───►│ Workflow N8N│
└───────────┘    └───────────┘    │    avec    │
       │                                    │   GPT-4o   │
       ┃                                    │   Vision   │
┬───────────┬                      └───────────┘
│  API Figma  │                                │
│             │                                ┃
└───────────┘                      ┬───────────┬
                                          │   Tuleap    │
                                          │  (Gestion   │
                                          │  de projet) │
                                          └───────────┘
```

### Nouveautés (Juin 2025)
- **Upload direct vers Cloudinary** : Les images sont maintenant uploadées directement depuis le plugin sans serveur intermédiaire
- **Suppression des dépendances MCP** : Architecture simplifiée sans dépendance à un serveur MCP
- **Gestion CORS améliorée** : Communication robuste avec n8n malgré les restrictions CORS

## Composant 1 : Plugin Figma

### Fonctionnalités
- Interface utilisateur pour sélectionner les frames/écrans à analyser
- Extraction et conversion des frames en base64
- Upload direct des images vers Cloudinary avec barre de progression
- Interface pour saisir les questions contextuelles business
- Communication avec le workflow n8n via webhook
- Gestion des erreurs CORS et notifications visuelles

### Installation
1. Ouvrez Figma et accédez à `Menu > Plugins > Development > Import plugin from manifest`
2. Sélectionnez le fichier `manifest.json` du projet

### Configuration
Le plugin utilise des valeurs par défaut pour Cloudinary et n8n, définies directement dans `ui.html` :

```javascript
// Configuration Cloudinary (dans ui.html)
const cloudName = 'du9e3f5rh'; // Valeur par défaut
const uploadPreset = 'ux-specs-preset'; // Valeur par défaut

// Configuration n8n (dans ui.html)
const n8nConfig = {
  webhook_url: 'http://localhost:5678/webhook/figma-analysis',
  timeout: 60000 // 60 secondes
};
```
```

### Workflow d'utilisation
1. L'utilisateur ouvre le plugin dans Figma
2. Sélection des frames/écrans à analyser ou analyse du projet complet
3. Le plugin extrait les frames et les convertit en base64
4. Upload automatique des images vers Cloudinary avec barre de progression
5. L'utilisateur répond aux questions contextuelles business
6. Le plugin envoie les données et URLs Cloudinary au workflow n8n
7. Affichage des résultats d'analyse
8. Option d'export des spécifications via N8N

## Composant 2 : Workflow N8N

### Fonctionnalités
- Orchestration complète du processus d'analyse
- Réception des URLs d'images Cloudinary depuis le plugin
- Intégration avec l'API OpenAI pour GPT-4o Vision
- Analyse des images avec contexte business
- Génération de spécifications produit
- Création d'artefacts dans Tuleap

### Installation
1. Assurez-vous d'avoir n8n installé (v0.214.0+)
2. Importez le fichier `N8N.json` dans votre instance n8n
3. Configurez les variables d'environnement n8n
4. Assurez-vous que CORS est correctement configuré pour accepter les requêtes du plugin Figma

### Configuration
Configurer les variables d'environnement suivantes dans n8n :

```
# OpenAI
OPENAI_API_KEY=votre_cle_api_openai

# Tuleap (optionnel)
TULEAP_API_URL=votre_url_api_tuleap
TULEAP_API_TOKEN=votre_token_api_tuleap
```

### Configuration CORS
Pour permettre au plugin Figma de communiquer avec n8n, ajoutez ces en-têtes CORS à votre configuration n8n :

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Démarrage
Lancez n8n avec la commande :

```bash
n8n start
```

Ou utilisez Docker :

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e OPENAI_API_KEY=votre_cle_api_openai \
  -e CLOUDINARY_CLOUD_NAME=votre_cloud_name \
  -e CLOUDINARY_API_KEY=votre_api_key \
  -e CLOUDINARY_API_SECRET=votre_api_secret \
  n8nio/n8n
```

### Flux de travail
1. Réception des données du plugin Figma via webhook
2. Validation et enrichissement des données
3. Analyse des images Cloudinary avec GPT-4o Vision
4. Génération des spécifications produit
5. Création des artefacts dans Tuleap (Epics, Features, User Stories)
6. Retour des résultats au plugin Figma

## Intégration GPT-4o Vision

### Fonctionnalités
- Analyse multimodale des designs Figma (texte + images)
- Compréhension profonde des interfaces utilisateur
- Détection des patterns de design et des composants
- Analyse contextuelle basée sur les objectifs business
- Génération de recommandations d'implémentation

### Configuration
La fonction `analyzeWithGPT4oVision` dans le workflow n8n utilise l'API OpenAI pour envoyer à la fois les données structurelles du design et les images des écrans à GPT-4o Vision.

## Flux de données complet

1. **Plugin Figma** → Sélection des écrans ou projet complet à analyser
2. **Plugin Figma** → Envoi des données au workflow n8n (clé de fichier, contexte business)
3. **Workflow N8N** → Récupération des données détaillées via l'API Figma
4. **Workflow N8N** → Extraction des écrans, composants et styles
5. **Workflow N8N** → Récupération des images des écrans via l'API Figma
6. **Workflow N8N** → Envoi des données et images à GPT-4o Vision pour analyse
7. **GPT-4o Vision** → Analyse multimodale et génération de résultats structurés
8. **Workflow N8N** → Génération des spécifications produit
9. **Workflow N8N** → Création des artefacts dans Tuleap
10. **Workflow N8N** → Retour des résultats au plugin Figma

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
- `CLOUDINARY_CLOUD_NAME` : Nom du cloud Cloudinary
- `CLOUDINARY_API_KEY` : Clé API Cloudinary
- `CLOUDINARY_API_SECRET` : Secret API Cloudinary
- `OPENAI_API_KEY` : Clé API OpenAI pour GPT-4o Vision
- `TULEAP_API_URL` : URL de l'API Tuleap (optionnel)
- `TULEAP_API_TOKEN` : Token API Tuleap (optionnel)

## Dépannage

### Problèmes courants et solutions

#### Le plugin Figma ne se connecte pas au workflow n8n
- Vérifiez que le workflow n8n est bien démarré sur le port 5678
- Vérifiez que les URLs dans le plugin pointent vers le bon workflow
- Assurez-vous que le plugin a accès au workflow local (problèmes CORS)

#### Le workflow n8n ne peut pas accéder à l'API Figma
- Vérifiez que le token Figma est valide et correctement configuré
- Assurez-vous que le token a les permissions nécessaires

#### L'analyse GPT-4o Vision échoue
- Vérifiez que la clé API OpenAI est valide
- Assurez-vous que vous avez accès au modèle GPT-4o Vision
- Vérifiez les logs pour les messages d'erreur détaillés

#### N8N ne reçoit pas les données du webhook
- Vérifiez que N8N est démarré et accessible sur le port 5678
- Assurez-vous que les URLs des webhooks sont correctes
- Vérifiez que le plugin peut accéder à N8N

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

### Mise à jour du plugin
1. Modifiez les fichiers du plugin selon vos besoins
2. Rechargez le plugin dans Figma via `Menu > Plugins > Development > Reload`

### Mise à jour du workflow N8N
1. Modifiez le workflow dans l'interface n8n
2. Exportez le workflow mis à jour pour la sauvegarde

### Avantages de la nouvelle architecture
1. **Simplicité** : Suppression de la couche MCP intermédiaire
2. **Maintenabilité** : Toute la logique d'orchestration est centralisée dans n8n
3. **Flexibilité** : Modification facile du workflow sans toucher au code du plugin
4. **Sécurité** : Pas de clés API exposées dans le plugin

## Licence

Ce projet est sous licence [MIT](LICENSE).
