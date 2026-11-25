import hljs from 'highlight.js/lib/common';
import dockerfile from 'highlight.js/lib/languages/dockerfile';

hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('gitignore', () => ({
  name: 'Git ignore',
  contains: [
    { scope: 'comment', begin: /^#/, end: /$/ },
    { scope: 'meta', begin: /^!/ },
    { scope: 'string', begin: /\*/, end: /(?=\/|$)/ },
  ],
}));

export default hljs;
