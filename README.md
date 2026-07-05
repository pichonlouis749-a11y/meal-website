# Carnet de Recettes

Application web de recettes avec comptes utilisateurs Supabase.

## Version actuelle

- Les recettes privées sont stockées dans Supabase.
- Chaque utilisateur peut créer un compte avec email et mot de passe.
- Un utilisateur connecté peut ajouter une recette.
- La suppression des recettes est réservée à l’admin.
- Un profil `admin` peut gérer toutes les recettes.
- Les visiteurs non connectés ne peuvent pas accéder au contenu.
- Les images sont encore ajoutées par URL pour garder cette version simple.

## Installation

Prérequis : Node.js 18 ou plus.

```bash
npm install
```

Aucune dépendance externe n’est nécessaire pour cette V1.

## Lancement local

```bash
npm start
```

Puis ouvrir :

```text
http://localhost:3000
```

Le port peut être changé avec `PORT` :

```bash
PORT=4000 npm start
```

Le serveur local sert uniquement les fichiers du site. Les comptes, recettes et droits sont gérés par Supabase.

## Projet Supabase

Projet créé :

```text
Meal Website Multi User
```

URL API :

```text
https://hrwckkwdipilwkjjzyzf.supabase.co
```

Tables créées :

- `profiles`
- `recipes`

Les règles de sécurité Supabase sont activées sur les deux tables.

## Fonctionnement des comptes

- Les recettes sont visibles uniquement après connexion.
- La connexion se fait avec email et mot de passe. Le pseudo sert uniquement à l’inscription et à l’affichage.
- Le bouton “Ajouter une recette” demande une connexion si aucun compte n’est actif.
- Après connexion, l’utilisateur peut publier une recette.
- Le bouton de suppression apparaît seulement pour un admin.

## Données de test

Les recettes existantes ont été importées dans Supabase :

- Salade de quinoa citronnée
- Fondant au chocolat simple
- Bol poulet, riz et légumes
- Lasagnes froide

Le fichier `data/recipes.json` reste présent comme ancienne sauvegarde locale, mais il n’est plus utilisé par l’application.

## Parcours d’ajout

Le formulaire d’ajout est guidé en 6 étapes :

1. Nom de la recette
2. Image optionnelle avec aperçu et message d’erreur si l’image ne charge pas
3. Ingrédients libres, ajoutables ligne par ligne
4. Préparation : étapes ordonnées et champ dédié “Lien vers la recette”, par exemple un post Instagram
5. Tags obligatoires et collection optionnelle
6. Vérification obligatoire avant publication

## Vérifications V1

- Accès privé aux recettes : page d’accueil et pages détail visibles après connexion.
- Recherche : nom, ingrédient, tag ou collection.
- Filtres : tags et collection.
- Ajout : accessible après connexion.
- Publication : visible par les utilisateurs connectés après création.
- Suppression : visible et possible uniquement pour un admin.
- Sécurité : règles Supabase RLS activées.

## Mise en ligne Hostinger

Configuration attendue :

1. Héberger cette application Node.js.
2. Point d’entrée : `server.js`.
3. Commande de démarrage : `npm start`.
4. Version Node.js : 18 ou plus.
5. Variable `PORT` : utiliser celle fournie par Hostinger si elle existe.
6. Vérifier que le site peut charger les scripts externes, dont Supabase.

Avant l’ouverture publique :

1. Ajouter l’URL Hostinger dans les réglages Supabase Auth.
2. Ajouter l’URL du domaine dans les redirections autorisées Supabase.
3. Activer la protection Supabase contre les mots de passe compromis.
4. Tester création de compte, connexion, ajout de recette, droits user/admin.

## Sécurité Supabase avant publication

À faire dans le dashboard Supabase du projet `Meal Website Multi User` :

1. Aller dans `Authentication` > `URL Configuration`.
2. Mettre l’URL finale du site Hostinger dans `Site URL`.
3. Ajouter aussi cette URL dans `Redirect URLs`.
4. Garder `http://localhost:3000` dans les URLs autorisées tant que les tests locaux continuent.
5. Aller dans `Authentication` > `Providers` > `Email`.
6. Garder la confirmation email activée.
7. Régler la longueur minimale du mot de passe à 8 caractères ou plus.
8. Activer la protection contre les mots de passe compromis si le plan Supabase le permet.

Les liens de confirmation email et de mot de passe oublié utilisent automatiquement l’URL du site en cours grâce à `window.location.origin`.
