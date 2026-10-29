import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  UploadCloud, Download, Copy, Check, Sparkles, Image as ImageIcon,
  Trash2, Camera, Palette, ArrowLeft, ArrowRight, Eye, Settings, Sliders
} from 'lucide-react';
import defaultLogo from '../assets/logo-oficial.png';

// Sugestões de Títulos com 1 clique (estilo humanizado & afetuoso)
const PRESET_TITLES = [
  'Que alegria receber esse feedback! ✈️',
  'Mais um sonho realizado com sucesso! 💙✨',
  'Gratidão imensa pela confiança! 🌴✈️',
  'Viajar sem preocupação não tem preço! 🧳💫'
];

// Sugestões de Mensagens de Acolhimento
const PRESET_MESSAGES = [
  {
    category: 'Gratidão & Sonhos',
    items: [
      'Muito obrigado pela confiança! Estamos sempre aqui para tornar cada viagem especial.',
      'Fazer parte da realização do seu sonho é o que nos move todos os dias! Obrigado pelo carinho.',
      'Mais uma família que viajou com tranquilidade, carinho e suporte humanizado do início ao fim!'
    ]
  },
  {
    category: 'Cuidado & Assessoria',
    items: [
      'Cuidar de cada detalhe da sua viagem é a nossa verdadeira paixão. Até a próxima aventura!',
      'Nosso compromisso é estar ao seu lado antes, durante e depois do embarque. Gratidão!',
      'Viajar com assessoria especializada faz toda a diferença. Sensação de dever cumprido!'
    ]
  }
];

// Helper seguro para desenhar cantos arredondados no Canvas
function drawRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}

// Helper para desenhar texto com espaçamento uniforme entre letras (watermark FEEDBACK)
function drawSpacedText(ctx, text, x, y, spacing) {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
  } else {
    const chars = text.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const totalW = charWidths.reduce((a, b) => a + b, 0) + (chars.length - 1) * spacing;
    let curX = x - totalW / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], curX + charWidths[i] / 2, y);
      curX += charWidths[i] + spacing;
    }
  }
}

export default function DepoimentosTab({ showToast }) {
  // Alternância mobile entre Personalização e Prévia
  const [mobileView, setMobileView] = useState('editor'); // 'editor' | 'preview'

  // Estados dos Arquivos e Imagens
  const [printImage, setPrintImage] = useState(null); // Print do WhatsApp
  const [bgImage, setBgImage] = useState(null);       // Foto de fundo dos clientes
  const [logoImgObj, setLogoImgObj] = useState(null); // Logo oficial da agência

  // Estados dos Textos e Controles
  const [storyTitle, setStoryTitle] = useState(PRESET_TITLES[0]);
  const [storyMessage, setStoryMessage] = useState(PRESET_MESSAGES[0].items[0]);
  const [imageScale, setImageScale] = useState(100);       // 70 a 120%
  const [blueIntensity, setBlueIntensity] = useState(82);  // 60 a 95% de opacidade do azul sobre a foto
  const [generating, setGenerating] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Refs para inputs
  const printInputRef = useRef(null);
  const printCameraRef = useRef(null);
  const bgInputRef = useRef(null);
  const bgCameraRef = useRef(null);
  const canvasRef = useRef(null);

  // Carrega a logo oficial do backend (ou fallback local)
  const loadLogo = useCallback(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImgObj(img);
    img.onerror = () => {
      const fallback = new Image();
      fallback.src = defaultLogo;
      fallback.onload = () => setLogoImgObj(fallback);
    };
    img.src = `/voucher-assets/agency-logo-white.png?v=${Date.now()}`;
  }, []);

  useEffect(() => {
    loadLogo();
    const onLogoUpdated = () => loadLogo();
    window.addEventListener('agency:logo-updated', onLogoUpdated);
    return () => window.removeEventListener('agency:logo-updated', onLogoUpdated);
  }, [loadLogo]);

  // Carrega imagem do print
  const handlePrintFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Selecione uma imagem válida (PNG, JPG, WebP)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setPrintImage(img);
        showToast?.('Print do depoimento carregado!', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  // Carrega foto de fundo dos clientes
  const handleBgFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Selecione uma imagem válida (PNG, JPG, WebP)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setBgImage(img);
        showToast?.('Foto de fundo dos clientes aplicada!', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  // Suporte a colar print com Ctrl+V
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          handlePrintFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePrintFile]);

  // ── Renderizador do Story no Canvas (1080 × 1920) ────────────────────────
  const drawStory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    // 1. FUNDO: Foto dos clientes com overlay azul OU degradê institucional (#00569e, #3871c1, #0a73b0)
    if (bgImage) {
      // Desenha foto preenchendo a tela (cover)
      const canvasRatio = W / H;
      const photoRatio = bgImage.width / bgImage.height;
      let sW, sH, sX, sY;

      if (photoRatio > canvasRatio) {
        sH = bgImage.height;
        sW = bgImage.height * canvasRatio;
        sX = (bgImage.width - sW) / 2;
        sY = 0;
      } else {
        sW = bgImage.width;
        sH = bgImage.width / canvasRatio;
        sX = 0;
        sY = (bgImage.height - sH) / 2;
      }
      ctx.drawImage(bgImage, sX, sY, sW, sH, 0, 0, W, H);

      // Camada de tonalização azul da marca sobre a foto (efeito monocromático elegante)
      const alpha = blueIntensity / 100;
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
      overlayGrad.addColorStop(0, `rgba(0, 86, 158, ${alpha})`);           // #00569e
      overlayGrad.addColorStop(0.5, `rgba(56, 113, 193, ${alpha * 0.95})`); // #3871c1
      overlayGrad.addColorStop(1, `rgba(10, 115, 176, ${alpha})`);          // #0a73b0
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, W, H);
    } else {
      // Degradê institucional com as cores oficiais: #00569e, #3871c1, #0a73b0
      const brandGrad = ctx.createLinearGradient(0, 0, 0, H);
      brandGrad.addColorStop(0, '#00569e');
      brandGrad.addColorStop(0.48, '#2563ab');
      brandGrad.addColorStop(0.78, '#3871c1');
      brandGrad.addColorStop(1, '#0a73b0');
      ctx.fillStyle = brandGrad;
      ctx.fillRect(0, 0, W, H);

      // Glow suave de iluminação no topo
      const glow = ctx.createRadialGradient(W / 2, 450, 60, W / 2, 450, 650);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. MARCAS D'ÁGUA "FEEDBACK" (Topo e Rodapé, idêntico à referência profissional)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 115px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.17)';

    // FEEDBACK no Topo
    drawSpacedText(ctx, 'FEEDBACK', W / 2, 130, 24);

    // FEEDBACK no Rodapé
    drawSpacedText(ctx, 'FEEDBACK', W / 2, 1830, 24);

    // 3. CARD CENTRAL DO PRINT DO WHATSAPP (Posicionado no terço superior)
    const printTopY = 270;
    const maxCardW = 900;
    const maxCardH = 760;
    let cardBottomY = printTopY + 450;

    if (printImage) {
      const scale = imageScale / 100;
      let drawW = maxCardW * scale;
      let drawH = (printImage.height / printImage.width) * drawW;

      if (drawH > maxCardH * scale) {
        drawH = maxCardH * scale;
        drawW = (printImage.width / printImage.height) * drawH;
      }

      const drawX = (W - drawW) / 2;
      const drawY = printTopY;
      cardBottomY = drawY + drawH;

      // Sombra realista flutuante
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 22;

      // Fundo branco do card
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.fill();
      ctx.restore();

      // Recorte com cantos arredondados para a imagem do print
      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.clip();
      ctx.drawImage(printImage, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Borda suave de acabamento
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.stroke();
    } else {
      // Placeholder se ainda não enviou o print
      const pw = 860;
      const ph = 460;
      const px = (W - pw) / 2;
      const py = printTopY;
      cardBottomY = py + ph;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      drawRoundRect(ctx, px, py, pw, ph, 28);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Envie o print do WhatsApp aqui', W / 2, py + ph / 2 - 18);

      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillText('(O depoimento aparecerá nesta posição)', W / 2, py + ph / 2 + 26);
    }

    // 4. TEXTOS HUMANIZADOS ABAIXO DO PRINT (Título + Frase de Acolhimento em fonte Serif elegante)
    const textStartY = Math.max(cardBottomY + 70, 1120);

    // Título em destaque (Ex: "Que alegria receber esse feedback! ✈️")
    ctx.font = 'bold 44px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(storyTitle.trim(), W / 2, textStartY);

    // Mensagem de acolhimento em corpo de texto harmonioso
    ctx.font = 'bold 32px "Georgia", "Times New Roman", serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';

    const maxTextWidth = 840;
    const words = storyMessage.trim().split(' ');
    const lines = [];
    let curLine = '';

    for (let w of words) {
      const testLine = curLine ? `${curLine} ${w}` : w;
      if (ctx.measureText(testLine).width > maxTextWidth && curLine) {
        lines.push(curLine);
        curLine = w;
      } else {
        curLine = testLine;
      }
    }
    if (curLine) lines.push(curLine);

    const messageStartY = textStartY + 64;
    const lineHeight = 50;
    lines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, messageStartY + (idx * lineHeight));
    });

    const textBottomY = messageStartY + (lines.length * lineHeight);

    // 5. LOGO OFICIAL DA AGÊNCIA (Centralizada na parte inferior antes do FEEDBACK)
    const logoAreaCenterY = Math.min(Math.max(textBottomY + 90, 1530), 1640);
    const logoSize = 150;

    if (logoImgObj && logoImgObj.complete) {
      const lx = (W - logoSize) / 2;
      const ly = logoAreaCenterY - logoSize / 2;
      ctx.drawImage(logoImgObj, lx, ly, logoSize, logoSize);
    } else {
      // Fallback tipográfico caso a imagem ainda não tenha carregado
      ctx.font = 'bold 28px -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('CLUBE DO VOO VIAGENS', W / 2, logoAreaCenterY);
    }
  }, [printImage, bgImage, logoImgObj, storyTitle, storyMessage, imageScale, blueIntensity]);

  useEffect(() => {
    drawStory();
  }, [drawStory]);

  // Download do Story em 1080 × 1920 PNG
  const handleDownloadStory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!printImage) {
      showToast?.('Selecione um print do WhatsApp antes de baixar', 'error');
      return;
    }

    setGenerating(true);
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast?.('Erro ao gerar arquivo de imagem', 'error');
          setGenerating(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `Story-Feedback-ClubeDoVoo-${Date.now()}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast?.('Story baixado em altíssima resolução (1080×1920)!', 'success');
        setGenerating(false);
      }, 'image/png');
    } catch {
      showToast?.('Falha ao processar download', 'error');
      setGenerating(false);
    }
  };

  // Copia legenda para o Instagram
  const handleCopyCaption = () => {
    const caption = `${storyTitle}\n\n` +
      `"${storyMessage}"\n\n` +
      `Cuidar de cada etapa da sua viagem com atenção, carinho e o melhor suporte é a nossa maior satisfação! 💙✈️\n\n` +
      `Quer viajar com tranquilidade e as melhores tarifas? Fale conosco no link da bio ou envie uma mensagem no direct! 💬📲\n\n` +
      `#clubedovoo #depoimento #avaliacaocliente #feedback #viagens #passagensaereas #turismo`;

    navigator.clipboard.writeText(caption).then(() => {
      setCopiedCaption(true);
      showToast?.('Legenda copiada para o Instagram!', 'success');
      setTimeout(() => setCopiedCaption(false), 2500);
    }).catch(() => {
      showToast?.('Erro ao copiar legenda', 'error');
    });
  };

  return (
    <div className="space-y-4 animate-fade-in pb-8">
      {/* Segmented Control Mobile (1. Personalizar vs 2. Prévia & Baixar) */}
      <div className="lg:hidden flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setMobileView('editor');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 min-h-[44px] transition-all cursor-pointer ${
            mobileView === 'editor'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>1. Personalizar</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileView('preview');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 min-h-[44px] transition-all cursor-pointer relative ${
            mobileView === 'preview'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>2. Prévia & Baixar</span>
          {printImage && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-220px)]">
        {/* Coluna 1: Controles e Uploads */}
        <div className={`lg:w-1/2 flex flex-col gap-5 min-w-0 ${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Bloco 1: Print do Depoimento */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between mb-3 min-h-[44px]">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                <UploadCloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                1. Print do Depoimento (WhatsApp)
              </h3>
              {printImage && (
                <button
                  type="button"
                  onClick={() => setPrintImage(null)}
                  className="min-h-[44px] px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Remover
                </button>
              )}
            </div>

            <div
              onClick={() => printInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-5 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30 hover:bg-indigo-50/30"
            >
              {printImage ? (
                <div className="flex items-center justify-center gap-3">
                  <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Print carregado! Clique para trocar ou cole um novo com Ctrl+V.
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <ImageIcon className="w-8 h-8 mx-auto text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Selecione o print da conversa
                  </p>
                  <p className="text-xs text-slate-400">
                    Ou arraste / cole com <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">Ctrl+V</kbd>
                  </p>
                </div>
              )}
              <input
                ref={printInputRef}
                type="file"
                accept="image/*"
                onChange={e => handlePrintFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>

            {/* Ajuste de tamanho do print */}
            {printImage && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> Tamanho do Print na Arte
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{imageScale}%</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={120}
                  value={imageScale}
                  onChange={e => setImageScale(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Bloco 2: Foto de Fundo dos Clientes (Opcional) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between min-h-[44px]">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                  <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  2. Foto dos Clientes de Fundo (Opcional)
                </h3>
                <p className="text-xs text-slate-400">
                  {bgImage ? 'Foto ativa com filtro azul da marca' : 'Sem foto: usa as cores oficiais (#00569e, #3871c1, #0a73b0)'}
                </p>
              </div>
              {bgImage && (
                <button
                  type="button"
                  onClick={() => setBgImage(null)}
                  className="min-h-[44px] px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Remover foto
                </button>
              )}
            </div>

            <div
              onClick={() => bgInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30"
            >
              {bgImage ? (
                <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-medium">
                  <Check className="w-5 h-5" /> Foto dos clientes aplicada! Clique para trocar.
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Clique para selecionar uma foto dos clientes ou da viagem
                  </p>
                  <p className="text-[11px] text-slate-400">
                    A foto receberá o filtro azul profissional com a marca d'água FEEDBACK
                  </p>
                </div>
              )}
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                onChange={e => handleBgFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>

            {/* Intensidade do Azul sobre a Foto */}
            {bgImage && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Intensidade do Azul sobre a Foto
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-600">{blueIntensity}%</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={95}
                  value={blueIntensity}
                  onChange={e => setBlueIntensity(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Bloco 3: Frases Humanizadas (Título & Mensagem) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
              <Sparkles className="w-5 h-5 text-amber-500" />
              3. Textos do Story (Abaixo do Print)
            </h3>

            {/* Título Principal */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Título em Destaque
              </label>
              <input
                type="text"
                value={storyTitle}
                onChange={e => setStoryTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRESET_TITLES.map((t, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setStoryTitle(t)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensagem / Frase de Acolhimento */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Mensagem de Acolhimento
              </label>
              <textarea
                rows={3}
                value={storyMessage}
                onChange={e => setStoryMessage(e.target.value)}
                className="w-full p-3 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed min-h-[80px]"
              />
              <div className="space-y-2 mt-2">
                {PRESET_MESSAGES.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {group.category}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {group.items.map((item, iIdx) => (
                        <button
                          key={iIdx}
                          type="button"
                          onClick={() => setStoryMessage(item)}
                          className={`text-left p-2.5 rounded-lg text-xs transition-all border cursor-pointer min-h-[40px] flex items-center ${
                            storyMessage === item
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-600 dark:text-indigo-200 font-semibold'
                              : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700/60 dark:text-slate-300'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Botão de avanço rápido para Prévia no Mobile */}
          <div className="lg:hidden pt-2">
            <button
              type="button"
              onClick={() => {
                setMobileView('preview');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 cursor-pointer transition-all"
            >
              <span>Ver Prévia & Baixar Story</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Coluna 2: Prévia ao Vivo em Formato Story (9:16) */}
        <div className={`lg:w-1/2 flex flex-col items-center ${mobileView === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="w-full max-w-sm lg:sticky lg:top-4 space-y-4">
            {/* Topbar da Prévia no Mobile */}
            <div className="lg:hidden flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMobileView('editor');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 min-h-[44px] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar para Edição
              </button>
              <span className="text-xs text-slate-400 font-mono">1080 × 1920 px</span>
            </div>

            <div className="hidden lg:flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Prévia do Story (9:16)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">1080 × 1920 px</span>
            </div>

            {/* Smartphone Mockup Frame */}
            <div className="relative rounded-[36px] p-3 bg-slate-900 border-4 border-slate-800 shadow-2xl mx-auto w-full max-w-[340px]">
              {/* Notch / Speaker */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-800 rounded-full z-20" />

              {/* Canvas 9:16 */}
              <div className="relative rounded-[26px] overflow-hidden aspect-[9/16] bg-slate-950 flex items-center justify-center shadow-inner">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadStory}
                disabled={generating || !printImage}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all min-h-[48px] cursor-pointer ${
                  generating || !printImage
                    ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/30'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>{generating ? 'Gerando Story…' : 'Baixar Story (PNG)'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCaption}
                className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-sm bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-sm transition-all min-h-[48px] cursor-pointer"
                title="Copiar legenda com hashtags para o Instagram"
              >
                {copiedCaption ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-600">Copiada!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Legenda</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
              Formato Instagram Stories 1080×1920 em alta nitidez com a logo e marcas da agência.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
