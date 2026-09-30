const cheerio = require('cheerio');

class ExtractorService {
  async extractFromUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL string is required');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OmniExtractBot/1.0; +https://omniextract.agent)'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      return this.extractFromHtml(html, url);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out while fetching URL');
      }
      throw err;
    }
  }

  extractFromHtml(html, sourceUrl = '') {
    const $ = cheerio.load(html);

    // Extract metadata
    const title = $('title').first().text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('h1').first().text().trim() || 'Untitled Document';

    const description = $('meta[name="description"]').attr('content') || 
                        $('meta[property="og:description"]').attr('content') || '';

    const author = $('meta[name="author"]').attr('content') || 
                   $('meta[property="article:author"]').attr('content') || 
                   $('.author, .byline').first().text().trim() || null;

    const publishedDate = $('meta[property="article:published_time"]').attr('content') || 
                          $('time').attr('datetime') || null;

    const ogImage = $('meta[property="og:image"]').attr('content') || 
                    $('meta[name="twitter:image"]').attr('content') || null;

    // Clean noise tags
    $('script, style, noscript, iframe, svg, canvas, nav, footer, header, form, aside').remove();
    $('.ad, .ads, .advertisement, .cookie-banner, .popup, .social-share, .sidebar').remove();

    // Prefer main or article if available
    let root = $('article, main, .content, #content, .post-content, .entry-content').first();
    if (!root || root.length === 0) {
      root = $('body');
    }

    // Convert DOM nodes to clean Markdown
    let markdown = this.htmlToMarkdown($, root);

    // Clean multiple newlines and spaces
    markdown = markdown
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    const estimatedTokens = Math.ceil(wordCount * 1.33);
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    return {
      status: 'success',
      sourceUrl,
      metadata: {
        title,
        description,
        author,
        publishedDate,
        ogImage,
        wordCount,
        estimatedTokens,
        readingTimeMinutes: readingTime
      },
      markdown
    };
  }

  htmlToMarkdown($, elem) {
    let result = '';

    elem.children().each((_, child) => {
      const tag = child.tagName ? child.tagName.toLowerCase() : '';
      const $child = $(child);

      if (child.type === 'text') {
        const text = $child.text();
        result += text;
        return;
      }

      switch (tag) {
        case 'h1':
          result += `\n\n# ${$child.text().trim()}\n\n`;
          break;
        case 'h2':
          result += `\n\n## ${$child.text().trim()}\n\n`;
          break;
        case 'h3':
          result += `\n\n### ${$child.text().trim()}\n\n`;
          break;
        case 'h4':
        case 'h5':
        case 'h6':
          result += `\n\n#### ${$child.text().trim()}\n\n`;
          break;
        case 'p':
          result += `\n\n${$child.text().trim()}\n\n`;
          break;
        case 'a':
          const href = $child.attr('href');
          const anchorText = $child.text().trim() || href;
          result += ` [${anchorText}](${href || '#'}) `;
          break;
        case 'strong':
        case 'b':
          result += ` **${$child.text().trim()}** `;
          break;
        case 'em':
        case 'i':
          result += ` *${$child.text().trim()}* `;
          break;
        case 'pre':
        case 'code':
          result += `\n\`\`\`\n${$child.text().trim()}\n\`\`\`\n`;
          break;
        case 'blockquote':
          result += `\n> ${$child.text().trim().replace(/\n/g, '\n> ')}\n\n`;
          break;
        case 'ul':
          result += '\n';
          $child.children('li').each((_, li) => {
            result += `- ${$(li).text().trim()}\n`;
          });
          result += '\n';
          break;
        case 'ol':
          result += '\n';
          $child.children('li').each((i, li) => {
            result += `${i + 1}. ${$(li).text().trim()}\n`;
          });
          result += '\n';
          break;
        case 'img':
          const alt = $child.attr('alt') || 'image';
          const src = $child.attr('src');
          if (src) {
            result += `\n![${alt}](${src})\n`;
          }
          break;
        default:
          result += this.htmlToMarkdown($, $child);
          break;
      }
    });

    return result;
  }
}

module.exports = new ExtractorService();
