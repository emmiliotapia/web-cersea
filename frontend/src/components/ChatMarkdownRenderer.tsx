import React from 'react';

/**
 * Componente de Renderizado de Markdown Clínico para CERSEA
 * =========================================================
 * Soporta:
 * - Negritas (`**texto**`, `__texto__`) y cursivas (`*texto*`, `_texto_`) incluso si están
 *   escribiéndose en tiempo real (streaming word-by-word) sin dejar asteriscos crudos visibles.
 * - Badges / Folios en código inline (`` `CERSEA-XXXX` ``).
 * - Enlaces Markdown (`[texto](url)`), URLs directas y números telefónicos clicables.
 * - Encabezados (`#`, `##`, `###`, `####`).
 * - Listas con viñetas (`-`, `•`, `*`) y listas numeradas (`1.`, `1)`).
 * - Citas (`> texto`) y separadores (`---`, `━━━`).
 * - Bloques de código (` ``` `).
 */

function sanitizeStreamingUnclosedDelimiters(text: string): string {
  let out = text;

  // Si durante el streaming hay un número impar de `**`, cerrarlo temporalmente al final de la línea
  // para que se vea en negrita desde la primera palabra en lugar de mostrar `**` crudo.
  const doubleStarMatches = out.match(/\*\*/g);
  if (doubleStarMatches && doubleStarMatches.length % 2 === 1) {
    out = `${out}**`;
  }

  // Si hay un backtick ` abierto durante el streaming, cerrarlo temporalmente
  const backtickMatches = out.match(/`/g);
  if (backtickMatches && backtickMatches.length % 2 === 1) {
    out = `${out}\``;
  }

  return out;
}

export function renderInlineMarkdown(rawLine: string): React.ReactNode[] {
  const line = sanitizeStreamingUnclosedDelimiters(rawLine);

  // Tokenizador recursivo de formato inline:
  // 1. Enlaces [label](url)
  // 2. Negrita + Cursiva ***texto***
  // 3. Negrita **texto** o __texto__
  // 4. Código inline / Folio `texto`
  // 5. Cursiva / Énfasis *texto* o _texto_
  const tokenRegex =
    /(\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

  const parts = line.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // 1. Enlace Markdown: [Texto](https://...)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#6D28D9] underline hover:text-[#4C1D95]"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // 2. Negrita + Cursiva: ***texto***
    if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
      const inner = part.slice(3, -3);
      return (
        <strong key={idx} className="font-bold italic text-slate-900">
          {renderInlineMarkdown(inner)}
        </strong>
      );
    }

    // 3. Negrita: **texto** o __texto__
    if (
      ((part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))) &&
      part.length > 4
    ) {
      const inner = part.slice(2, -2);
      return (
        <strong key={idx} className="font-bold text-slate-900">
          {renderInlineMarkdown(inner)}
        </strong>
      );
    }

    // 4. Código inline / Folio: `CERSEA-XXXX`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const codeText = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-purple-100/90 text-[#5B21B6] border border-purple-200 font-mono font-bold text-[11px]"
        >
          {codeText}
        </code>
      );
    }

    // 5. Énfasis / Cursiva: *texto* o _texto_
    if (
      ((part.startsWith('*') && part.endsWith('*')) ||
        (part.startsWith('_') && part.endsWith('_'))) &&
      part.length > 2
    ) {
      const inner = part.slice(1, -1);
      return (
        <span key={idx} className="font-semibold text-slate-800">
          {renderInlineMarkdown(inner)}
        </span>
      );
    }

    // Limpiar cualquier símbolo markdown suelto residual
    const cleanText = part
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/(^|\s)\*(?=\s|$)/g, '$1');

    return <span key={idx}>{cleanText}</span>;
  });
}

export const ChatMarkdownRenderer: React.FC<{
  content: string;
  isUser?: boolean;
}> = ({ content, isUser = false }) => {
  if (!content) return null;

  if (isUser) {
    return <span className="whitespace-pre-wrap leading-relaxed">{content}</span>;
  }

  // Normalizar saltos de línea y separar listas que vengan pegadas en una sola línea
  const normalized = content
    .replace(/\r\n/g, '\n')
    // Si el LLM envía "Texto: - Punto 1 - Punto 2" en la misma línea, separarlo limpiamente
    .replace(/([.:])\s+-\s+\*\*/g, '$1\n- **')
    .replace(/([.:])\s+•\s+/g, '$1\n• ');

  const rawLines = normalized.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  rawLines.forEach((rawLine, i) => {
    const trimmed = rawLine.trim();

    // Manejo de bloques de código ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="my-2 p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto"
          >
            {codeBuffer.join('\n')}
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      return;
    }

    // Línea vacía -> espaciado sutil
    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      return;
    }

    // Separador horizontal (---, ***, ━━━━━━)
    if (/^[━─=\-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="border-slate-200/90 my-2" />);
      return;
    }

    // Encabezados (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].replace(/\*\*/g, '');
      elements.push(
        <div
          key={`h-${i}`}
          className={`${
            level <= 2 ? 'text-sm font-bold text-[#5B21B6]' : 'text-xs font-bold text-slate-900'
          } pt-1 pb-0.5`}
        >
          {renderInlineMarkdown(headingText)}
        </div>
      );
      return;
    }

    // Citas (> texto)
    if (trimmed.startsWith('>')) {
      const quoteContent = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote
          key={`q-${i}`}
          className="pl-3 py-1 my-1 border-l-3 border-[#6D28D9] bg-purple-50/50 rounded-r-lg text-slate-700 italic"
        >
          {renderInlineMarkdown(quoteContent)}
        </blockquote>
      );
      return;
    }

    // Viñetas (- texto, • texto, o * texto con espacio)
    const bulletMatch = trimmed.match(/^([-•]|\*(?=\s))\s+(.*)$/);
    if (bulletMatch) {
      const itemContent = bulletMatch[2];
      elements.push(
        <div key={`ul-${i}`} className="flex items-start gap-2 pl-1 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6D28D9] mt-[7px] shrink-0" />
          <div className="flex-1 leading-relaxed">{renderInlineMarkdown(itemContent)}</div>
        </div>
      );
      return;
    }

    // Listas numeradas (1. texto, 1) texto, o emojis numéricos 1️⃣)
    const numMatch = trimmed.match(/^(\d+[.)]|[1-9]️⃣)\s+(.*)$/);
    if (numMatch) {
      const badgeLabel = numMatch[1].replace('️⃣', '.');
      const itemContent = numMatch[2];
      elements.push(
        <div key={`ol-${i}`} className="flex items-start gap-2 pl-1 py-0.5">
          <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-purple-100 text-[#6D28D9] font-bold text-[10px] flex items-center justify-center mt-0.5 shrink-0">
            {badgeLabel}
          </span>
          <div className="flex-1 leading-relaxed">{renderInlineMarkdown(itemContent)}</div>
        </div>
      );
      return;
    }

    // Párrafo normal
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  });

  return <div className="space-y-1">{elements}</div>;
};

