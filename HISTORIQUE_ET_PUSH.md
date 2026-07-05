# Historique et mode opératoire

Ce document sert de mémo pour reprendre le projet proprement, comprendre les décisions déjà prises, et publier les prochaines modifications sur GitHub puis Hostinger.

## Historique du projet

- Le site `Carnet de Recettes` est une application Node.js simple servie par `server.js`.
- L’interface est dans le dossier `public/`.
- Les comptes et les recettes sont stockés dans Supabase.
- Le site est déployé sur Hostinger à partir du dépôt GitHub `pichonlouis749-a11y/meal-website`.
- Hostinger est connecté à GitHub : après un push sur `main`, le bouton `Redeploy` permet de remettre `basilic.cc` à jour.

## Décisions fonctionnelles

- Le site est privé : un visiteur non connecté ne doit pas voir les recettes.
- L’inscription demande un pseudo, un email et un mot de passe.
- La connexion se fait uniquement avec email et mot de passe.
- Le pseudo sert à l’affichage, par exemple `Bienvenue Louis`.
- Un utilisateur connecté peut ajouter une recette.
- La suppression d’une recette est réservée au compte admin.
- Les recettes restent visibles par tous les utilisateurs connectés.

## Supabase

- Projet : `Meal Website Multi User`
- URL API : `https://hrwckkwdipilwkjjzyzf.supabase.co`
- Tables principales :
  - `profiles`
  - `recipes`
- RLS activé sur les tables.
- Les recettes publiées sont lisibles uniquement par les utilisateurs authentifiés.
- Les utilisateurs simples ne peuvent pas supprimer de recette.
- Le rôle admin est porté par la table `profiles`.

## Garde-fous de code

Avant chaque commit :

```bash
node --check public/app.js
node --check server.js
git diff --check
```

À vérifier manuellement quand on touche à l’auth :

- Déconnecté : le site affiche seulement l’écran de connexion.
- Connexion email : l’accueil charge les recettes.
- Refresh connecté : l’accueil recharge sans page blanche.
- Déconnexion : retour à l’écran privé.
- Ajouter une recette : accessible seulement connecté.
- Compte simple : pas de bouton suppression.
- Compte admin : bouton suppression visible.

## Mode opératoire pour publier

Depuis le Terminal :

```bash
cd "/Users/louispichon/Library/Mobile Documents/com~apple~CloudDocs/Documents perso/Meal_website"
git status
git push origin main
```

Ensuite dans Hostinger :

1. Ouvrir l’application `basilic.cc`.
2. Vérifier que le dépôt GitHub est bien connecté.
3. Cliquer sur `Redeploy`.
4. Attendre la fin du déploiement.
5. Ouvrir le site en navigation privée pour tester l’accès déconnecté.
6. Se connecter avec un compte existant et tester le refresh de la page d’accueil.

## À retenir

- Ne jamais mettre de clé Supabase `service_role` dans `public/app.js`.
- Le code public peut contenir la clé publishable Supabase.
- Si un bug d’auth apparaît, vérifier d’abord le cache navigateur et le `v=...` dans `index.html`.
- Quand Hostinger garde une ancienne version, augmenter la valeur de cache-bust dans `index.html`, par exemple `app.js?v=email-auth-5`.
