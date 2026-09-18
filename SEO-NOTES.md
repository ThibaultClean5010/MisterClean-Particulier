# Suivi SEO — septembre 2026

## Corrections du site

- Les liens des prestations utilisent `/booking/<prestation>` sans paramètres. Les anciennes adresses `?service=...` restent compatibles et toutes ces variantes désignent `/booking` comme adresse canonique.
- La construction (`npm run build`) génère les onze pages de présélection. Prévisualiser le dossier `dist`, pas uniquement les fichiers sources, pour vérifier ces adresses.
- Les titres structurent les véritables sections ; les légendes du carrousel et les éléments décoratifs gardent leur apparence sans multiplier les titres ou les balises d'emphase.
- Une icône Apple de 180 × 180 pixels, des métadonnées de partage cohérentes, des fils d'Ariane structurés du blog et des liens contextuels vers le guide canapé ont été ajoutés.
- Les boutons de partage utilisent uniquement l'adresse canonique publique, sans paramètres de réservation. Ils ne chargent aucun SDK social.
- L'administration et l'annulation restent en `noindex`. Le sitemap ne contient que les quatre pages publiques canoniques, pas les variantes de réservation.

Vérification locale : `npm test`, `npm run typecheck`, `npm run build`, puis `npm run seo:audit`. L'audit local vérifie les liens et médias internes, les titres, les métadonnées, les données structurées, l'icône, les variantes de réservation et le sitemap ; il ne mesure ni le classement Google ni les backlinks.

## Prochaines actions externes

1. Après publication, relancer le même audit SEO pour obtenir un score comparable. Le score fourni initialement était de 81 % ; aucun nouveau score tiers n'est présumé.
2. Dans Google Search Console, vérifier le sitemap et l'indexation de l'accueil, du blog et de l'article.
3. Vérifier les coordonnées, les services, les horaires et la zone desservie de la fiche Google Business Profile. Garder les informations cohérentes avec le site.
4. Développer de vrais liens depuis des partenaires locaux et des annuaires pertinents, avec leur accord. Ne pas acheter de liens de classement ni créer de faux avis.
5. Publier des articles utiles sur l'entretien des tissus, canapés, moquettes et matelas, illustrés par des réalisations autorisées, puis les relier aux prestations pertinentes.

Le faible nombre de backlinks signalé par l'outil ne se corrige pas uniquement dans le code. Les nombres de titres et de balises en gras ne sont pas des quotas de classement Google ; leur pertinence et la lisibilité priment. Des liens répétés entre l'en-tête et le pied de page restent utiles à la navigation.

## Références officielles

- [Guide de démarrage SEO Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Structure des URL](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Liens explorables et textes de liens](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Visibilité locale Google](https://support.google.com/business/answer/7091?hl=fr)
- [Règles contre les liens artificiels](https://developers.google.com/search/docs/essentials/spam-policies)
