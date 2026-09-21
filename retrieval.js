const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set(['le','la','les','de','des','du','un','une','et','en','est','que','qui','pour','dans','sur','avec',
  'ce','ces','se','sa','son','ses','au','aux','par','plus','ne','pas','pour','il','elle','ils','elles','on','nous','vous',
  'je','tu','me','te','lui','leur','leurs','mais','ou','donc','or','ni','car','comme','être','avoir','fait','faire',
  'a','à','d','l','qu','s','c','n','j','y','si','tout','tous','toute','toutes','cette','cet','était','sont','été',
  'peut','bien','aussi','entre','sans','sous','vers','depuis','alors','ainsi','même','très','quand','où','quoi',
  'comment','arrivée','arriver','cela','celui','celle','ceux','celles','dont','leur','notre','votre','nos','vos',
  'nous','vous','ont','avons','avez','était','étaient','sera','seront','peut','peuvent','doit','doivent','deux',
  'trois','chaque','encore','ainsi','donc','ici','là','fois','dit','dire','dès','avant','après','pendant']);

function tokenize(text){
  return (text.toLowerCase().match(/[a-zàâäéèêëïîôöùûüçœ0-9]+/gi) || [])
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function loadBooks(booksDir){
  const chunks = [];
  if(!fs.existsSync(booksDir)) return chunks;
  const files = fs.readdirSync(booksDir).filter(f => f.endsWith('.txt'));
  for(const file of files){
    const bookName = path.basename(file, '.txt');
    const content = fs.readFileSync(path.join(booksDir, file), 'utf8');
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40);
    // Regrouper les tout petits paragraphes avec le suivant pour des chunks plus substantiels
    let buffer = '';
    for(const p of paragraphs){
      buffer += (buffer ? '\n\n' : '') + p;
      if(buffer.length > 600){
        chunks.push({ book: bookName, text: buffer, tokens: tokenize(buffer) });
        buffer = '';
      }
    }
    if(buffer) chunks.push({ book: bookName, text: buffer, tokens: tokenize(buffer) });
  }
  console.log(`Recherche documentaire : ${chunks.length} passages chargés depuis ${files.length} livre(s).`);
  return chunks;
}

function retrieveRelevant(question, chunks, topN = 8){
  const qTokens = tokenize(question);
  if(qTokens.length === 0 || chunks.length === 0) return [];

  const scored = chunks.map(chunk => {
    let score = 0;
    for(const qt of qTokens){
      for(const ct of chunk.tokens){
        if(ct === qt) score += 2;
        else if(ct.startsWith(qt) || qt.startsWith(ct)){
          if(Math.min(ct.length, qt.length) >= 4) score += 1;
        }
      }
    }
    return { ...chunk, score };
  }).filter(c => c.score > 0);

  scored.sort((a, b) => b.score - a.score);
  if(scored.length === 0) return [];

  // Concentrer la réponse : privilégier le livre le plus pertinent plutôt que
  // disperser les extraits entre de nombreux livres différents.
  const primaryBook = scored[0].book;
  const sameBook = scored.filter(c => c.book === primaryBook).slice(0, topN);
  if(sameBook.length >= topN) return sameBook;

  const others = scored.filter(c => c.book !== primaryBook).slice(0, topN - sameBook.length);
  return [...sameBook, ...others];
}

function bookTitle(slug){
  const titles = {
    'mystere-unique-emane': "Le Mystère de l'Unique Émané",
    'trois-mysteres-de-christ': 'Les Trois Mystères de Christ',
    'plenitude-revelee': 'La Plénitude Révélée',
    'conscience-du-christ-tome1': 'La Conscience du Christ (Tome I)',
    'vraie-histoire-de-satan': 'La Vraie Histoire de Satan',
    'conscience-du-corps-de-christ-tome2': 'La Conscience du Corps de Christ (Tome II)',
    'traite-des-verites-1': 'Traité des Vérités n°1',
    'traite-des-verites-2': 'Traité des Vérités n°2',
    'traite-des-verites-3': 'Traité des Vérités n°3',
    'traite-des-verites-4': 'Traité des Vérités n°4',
    'traite-des-verites-6': 'Traité des Vérités n°6',
    'traite-des-verites-8': 'Traité des Vérités n°8',
    'traite-des-verites-9': 'Traité des Vérités n°9',
    'histoire-de-la-priere': "L'Histoire de la Prière dans les Écritures",
    'verites-nouvelle-alliance-saint-esprit': 'Les Vérités de la Nouvelle Alliance selon le Saint Esprit'
  };
  return titles[slug] || slug;
}

function buildContextBlock(question, chunks){
  const relevant = retrieveRelevant(question, chunks, 5);
  if(relevant.length === 0) return '';
  let block = "\n\n=== CONTEXTE DOCUMENTAIRE PERTINENT POUR CETTE QUESTION (extraits réels des livres, à utiliser en priorité) ===\n";
  for(const r of relevant){
    block += `\n--- Extrait de "${bookTitle(r.book)}" ---\n${r.text}\n`;
  }
  return block;
}

module.exports = { loadBooks, buildContextBlock };
