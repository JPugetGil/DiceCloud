import { marked } from 'marked';

marked.setOptions({
  breaks: true,
  gfm: true,
  silent: true,
  smartLists: true,
  smartypants: true,
  //baseUrl: 'https://dicecloud.com',
});
