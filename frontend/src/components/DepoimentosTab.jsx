import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  UploadCloud, Download, Copy, Check, Sparkles, RefreshCw, Star,
  HeartHandshake, Image as ImageIcon, Trash2, Camera, Palette, MessageSquare,
  ArrowLeft, ArrowRight, Eye
} from 'lucide-react';
import logoImg from '../assets/logo.png';

// Coleção categorizada de frases de acolhimento humanizadas
const PRESET_PHRASES = [
  {
    category: 'Sonhos & Família',
    phrases: [
      'Fazer parte da realização do seu sonho é o que nos move todos os dias! 💙✈️',
      'Mais uma família que viajou com tranquilidade e suporte do início ao fim! 👨‍👩‍👧‍👦✨',
      'Ver a alegria de vocês ao embarcar não tem preço. Obrigado pelo carinho! 🌟',
      'Viajar é colecionar memórias que ficam para sempre no coração! 🌏💫'
    ]
  },
  {
    category: 'Cuidado & Confiança',
    phrases: [
      'Cuidar de cada detalhe da sua viagem é a nossa verdadeira paixão. Obrigado pela confiança! 🌏✨',
      'Nosso compromisso é estar ao seu lado antes, durante e depois do embarque. 💬✈️',
      'Nada nos enche mais de orgulho do que ver nossos passageiros tão bem acolhidos! 💙',
      'A sua tranquilidade é a nossa prioridade absoluta em cada roteiro! 🌟'
    ]
  },
  {
    category: 'Sem Perrengue & Tranquilidade',
    phrases: [
      'Viagem sem dor de cabeça e com suporte humanizado de verdade. Até a próxima aventura! 🧳✨',
      'Viajar com assessoria especializada faz toda a diferença. Gratidão pelo retorno tão especial! 🌴✈️',
      'Sensação de dever cumprido quando tudo sai exatamente como planejado! 🌟✈️',
      'Obrigado por nos escolher para cuidar de um momento tão especial da sua vida! 💫'
    ]
  }
];

const THEMES = [
  {
    id: 'azul-institucional',
    name: 'Azul Institucional',
    bgGradient: ['#021b38', '#003366', '#004f8c'],
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    subTextColor: '#94a3b8',
    bubbleBg: '#ffffff',
    cardBorder: 'rgba(255, 255, 255, 0.15)',
    starColor: '#fbbf24'
  },
  {
    id: 'clean-perola',
    name: 'Clean Pérola',
    bgGradient: ['#f8fafc', '#f1f5f9', '#e2e8f0'],
    accentColor: '#0284c7',
    textColor: '#0f172a',
    subTextColor: '#475569',
    bubbleBg: '#ffffff',
    cardBorder: 'rgba(15, 23, 42, 0.08)',
    starColor: '#d97706'
  },
  {
    id: 'dark-luxury',
    name: 'Dark Luxury',
    bgGradient: ['#090d16', '#0f172a', '#1e293b'],
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
    subTextColor: '#94a3b8',
    bubbleBg: '#ffffff',
    cardBorder: 'rgba(255, 255, 255, 0.12)',
    starColor: '#fbbf24'
  },
  {
    id: 'sunset-dourado',
    name: 'Sunset Dourado',
    bgGradient: ['#1e1b4b', '#312e81', '#3730a3'],
    accentColor: '#f59e0b',
    textColor: '#ffffff',
    subTextColor: '#cbd5e1',
    bubbleBg: '#ffffff',
    cardBorder: 'rgba(245, 158, 11, 0.25)',
    starColor: '#fbbf24'
  }
];

const BADGES = [
  { id: '5stars', label: '⭐ Atendimento 5 Estrelas' },
  { id: 'trip', label: '✈️ Viagem Realizada' },
  { id: 'client', label: '💙 Cliente Clube do Voo' },
  { id: 'real', label: '💬 Depoimento Real' },
  { id: 'none', label: 'Nenhum' }
];

// Helper seguro para desenhar cantos arredondados no Canvas (com fallback)
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

export default function DepoimentosTab({ showToast }) {
  // Estado para alternância mobile entre Edição e Prévia
  const [mobileView, setMobileView] = useState('editor'); // 'editor' | 'preview'

  // Estado da imagem do print do cliente
  const [printImage, setPrintImage] = useState(null);
  const [clientName, setClientName] = useState('');
  const [selectedPhrase, setSelectedPhrase] = useState(PRESET_PHRASES[0].phrases[0]);
  const [selectedThemeId, setSelectedThemeId] = useState('azul-institucional');
  const [selectedBadge, setSelectedBadge] = useState('5stars');
  const [imageScale, setImageScale] = useState(100); // 70 a 120%
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const canvasRef = useRef(null);
  const dropZoneRef = useRef(null);

  const currentTheme = useMemo(() => {
    return THEMES.find(t => t.id === selectedThemeId) || THEMES[0];
  }, [selectedThemeId]);

  // Carrega imagem selecionada
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Por favor selecione uma imagem (PNG, JPEG, WebP)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setPrintImage(img);
        showToast?.('Print do depoimento carregado com sucesso!', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  // Suporte a colar imagem (Ctrl+V) em qualquer lugar da tela
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          handleFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFile]);

  // Renderizador no Canvas (1080 x 1920)
  const drawStory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    // 1. Fundo com degradê refinado
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, currentTheme.bgGradient[0]);
    grad.addColorStop(0.5, currentTheme.bgGradient[1]);
    grad.addColorStop(1, currentTheme.bgGradient[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Efeito de brilho / glow suave no topo
    const glow = ctx.createRadialGradient(W / 2, 280, 50, W / 2, 280, 550);
    glow.addColorStop(0, currentTheme.id === 'clean-perola' ? 'rgba(2, 132, 199, 0.08)' : 'rgba(56, 189, 248, 0.15)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 800);

    // 2. Elementos Decorativos no Topo (Aspas e Citação)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Aspas douradas / citação elegante
    ctx.font = 'bold 72px "Georgia", serif';
    ctx.fillStyle = currentTheme.accentColor;
    ctx.fillText('“', W / 2, 140);

    // 3. Frase de Acolhimento Humanizada
    let displayPhrase = selectedPhrase.trim();
    if (clientName.trim()) {
      displayPhrase = `“Obrigado pelo carinho, ${clientName.trim()}! ${displayPhrase}”`;
    }

    ctx.font = '600 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = currentTheme.textColor;

    // Quebra de linha inteligente para a frase de acolhimento
    const maxPhraseWidth = 860;
    const words = displayPhrase.split(' ');
    const lines = [];
    let curLine = '';

    for (let w of words) {
      const testLine = curLine ? `${curLine} ${w}` : w;
      if (ctx.measureText(testLine).width > maxPhraseWidth && curLine) {
        lines.push(curLine);
        curLine = w;
      } else {
        curLine = testLine;
      }
    }
    if (curLine) lines.push(curLine);

    const phraseStartY = 230;
    const lineHeight = 54;
    lines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, phraseStartY + (idx * lineHeight));
    });

    // 4. Selo de Prova Social (Abaixo da frase)
    const phraseBottomY = phraseStartY + (lines.length * lineHeight) + 20;
    if (selectedBadge !== 'none') {
      const badgeObj = BADGES.find(b => b.id === selectedBadge);
      if (badgeObj) {
        const badgeText = badgeObj.label;
        ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
        const badgeWidth = ctx.measureText(badgeText).width + 48;
        const badgeHeight = 46;
        const badgeX = (W - badgeWidth) / 2;
        const badgeY = phraseBottomY + 10;

        // Fundo do selo com borda suave
        ctx.fillStyle = currentTheme.id === 'clean-perola' ? 'rgba(2, 132, 199, 0.1)' : 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        drawRoundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 23);
        ctx.fill();

        ctx.strokeStyle = currentTheme.id === 'clean-perola' ? 'rgba(2, 132, 199, 0.3)' : 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = currentTheme.accentColor;
        ctx.fillText(badgeText, W / 2, badgeY + badgeHeight / 2 + 1);
      }
    }

    // 5. Card Central do Print do Cliente (Sombra flutuante realista + cantos arredondados)
    const cardTopY = 480;
    const cardBottomY = 1680;
    const availableHeight = cardBottomY - cardTopY;
    const maxCardWidth = 920;

    if (printImage) {
      // Calcula dimensões preservando proporção
      const scaleMultiplier = imageScale / 100;
      let drawW = maxCardWidth * scaleMultiplier;
      let drawH = (printImage.height / printImage.width) * drawW;

      if (drawH > availableHeight) {
        drawH = availableHeight * scaleMultiplier;
        drawW = (printImage.width / printImage.height) * drawH;
      }

      const drawX = (W - drawW) / 2;
      const drawY = cardTopY + (availableHeight - drawH) / 2;

      // Sombra realista
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;

      // Fundo branco do card (caso o print tenha transparência)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.fill();
      ctx.restore();

      // Recorta cantos arredondados para a imagem
      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.clip();
      ctx.drawImage(printImage, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Borda sutil de acabamento
      ctx.strokeStyle = currentTheme.cardBorder;
      ctx.lineWidth = 3;
      ctx.beginPath();
      drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
      ctx.stroke();
    } else {
      // Placeholder quando ainda não enviou print
      const pw = 840;
      const ph = 960;
      const px = (W - pw) / 2;
      const py = cardTopY + (availableHeight - ph) / 2;

      ctx.strokeStyle = currentTheme.id === 'clean-perola' ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      drawRoundRect(ctx, px, py, pw, ph, 28);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '500 32px -apple-system, sans-serif';
      ctx.fillStyle = currentTheme.subTextColor;
      ctx.fillText('Envie ou cole o print do WhatsApp aqui', W / 2, py + ph / 2 - 20);

      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillText('(O print aparecerá aqui em destaque)', W / 2, py + ph / 2 + 30);
    }

    // 6. Rodapé Institucional da Agência
    const footerY = 1790;

    // Linha divisória sutil
    ctx.strokeStyle = currentTheme.id === 'clean-perola' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((W - 800) / 2, footerY - 50);
    ctx.lineTo((W + 800) / 2, footerY - 50);
    ctx.stroke();

    // Nome da agência e @ Instagram
    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = currentTheme.textColor;
    ctx.fillText('Clube do Voo Viagens', W / 2, footerY - 5);

    ctx.font = '600 24px -apple-system, sans-serif';
    ctx.fillStyle = currentTheme.accentColor;
    ctx.fillText('@clubedovooviagens  •  clubedovoo.com.br', W / 2, footerY + 38);
  }, [printImage, clientName, selectedPhrase, currentTheme, selectedBadge, imageScale]);

  // Redesenha sempre que os parâmetros mudarem
  useEffect(() => {
    drawStory();
  }, [drawStory]);

  // Download do Story em 1080x1920 PNG
  const handleDownloadStory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!printImage) {
      showToast?.('Selecione ou cole um print de depoimento antes de baixar', 'error');
      return;
    }

    setGenerating(true);
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast?.('Falha ao gerar arquivo de imagem', 'error');
          setGenerating(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (clientName.trim() || 'cliente').replace(/[^a-zA-Z0-9_-]/g, '');
        a.download = `Story-Depoimento-${safeName}-${Date.now()}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast?.('Story baixado com sucesso em 1080x1920 (alta resolução)!', 'success');
        setGenerating(false);
      }, 'image/png');
    } catch {
      showToast?.('Erro ao processar imagem para download', 'error');
      setGenerating(false);
    }
  };

  // Copia legenda para o Instagram
  const handleCopyCaption = () => {
    const nameStr = clientName.trim() ? ` da ${clientName.trim()}` : '';
    const caption = `Mais uma viagem inesquecível realizada com todo suporte e carinho${nameStr}! ✈️🌍✨\n\n` +
      `"${selectedPhrase}"\n\n` +
      `Obrigado pela confiança em escolher o Clube do Voo Viagens. Cada mensagem como essa nos enche de orgulho e motivação! 💙\n\n` +
      `Quer planejar sua próxima viagem com a mesma tranquilidade e os melhores preços? Fale conosco pelo link da bio ou envie uma mensagem no direct! 💬📲\n\n` +
      `#clubedovoo #depoimento #avaliacaocliente #viagens #passagensaereas #turismo #viajarcomtranquilidade`;

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
      {/* Segmented Control no Topo para Mobile (Permite alternar entre personalização e prévia) */}
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
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>2. Prévia & Baixar</span>
          {printImage && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" title="Print pronto" />
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-220px)]">
        {/* Coluna 1: Controles e Personalização */}
        <div className={`lg:w-1/2 flex flex-col gap-5 min-w-0 ${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Bloco 1: Upload do Print */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between mb-3 min-h-[44px]">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                <UploadCloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Print do Depoimento
              </h3>
              {printImage && (
                <button
                  type="button"
                  onClick={() => setPrintImage(null)}
                  className="min-h-[44px] px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Remover print
                </button>
              )}
            </div>

            <div
              ref={dropZoneRef}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-5 sm:p-6 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20"
            >
              {printImage ? (
                <div className="flex items-center justify-center gap-3">
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Print carregado! Clique para trocar ou selecione uma nova foto.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Clique para selecionar o print da conversa
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No computador: arraste ou cole com <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">Ctrl+V</kbd>
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={e => handleFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>

            {/* Ações diretas de foto / galeria no Mobile */}
            <div className="mt-3 md:hidden flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-sm font-medium min-h-[44px] active:bg-indigo-50 dark:active:bg-indigo-950/40 cursor-pointer"
              >
                <Camera className="w-4 h-4" /> Tirar foto ou abrir câmera
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => handleFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>
          </div>

          {/* Bloco 2: Frase de Acolhimento Humanizada */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Frase de Acolhimento
              </h3>
              <span className="text-xs text-slate-400">Humanizado & Afetuoso</span>
            </div>

            {/* Nome do Cliente (opcional) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Nome do Cliente (Opcional)
              </label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Ex: Mariana, Família Silva, Dr. Roberto"
                className="w-full px-3.5 py-2.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
              />
            </div>

            {/* Frase selecionada (editável) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Texto da Mensagem
              </label>
              <textarea
                rows={3}
                value={selectedPhrase}
                onChange={e => setSelectedPhrase(e.target.value)}
                placeholder="Digite a frase de acolhimento para o story..."
                className="w-full p-3 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed min-h-[80px]"
              />
            </div>

            {/* Banco de Frases Rápidas com 1 clique */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Sugestões Prontas (Toque para aplicar):
              </label>
              <div className="space-y-3">
                {PRESET_PHRASES.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      {group.category}
                    </span>
                    <div className="flex flex-col gap-2">
                      {group.phrases.map((phrase, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setSelectedPhrase(phrase)}
                          className={`text-left p-3 rounded-xl text-xs sm:text-sm transition-all border cursor-pointer min-h-[44px] flex items-center ${
                            selectedPhrase === phrase
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-600 dark:text-indigo-200 font-semibold shadow-xs ring-1 ring-indigo-400/30'
                              : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bloco 3: Estilo Visual & Selo */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
              <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Tema & Detalhes Visuais
            </h3>

            {/* Seletor de Tema / Fundo */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                Fundo do Story
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedThemeId(theme.id)}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-2 min-h-[72px] justify-center ${
                      selectedThemeId === theme.id
                        ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-md bg-indigo-50/20 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div
                      className="w-full h-8 rounded-lg shadow-inner"
                      style={{
                        background: `linear-gradient(135deg, ${theme.bgGradient[0]}, ${theme.bgGradient[2]})`
                      }}
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selo de Prova Social */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                Selo de Prova Social
              </label>
              <div className="flex flex-wrap gap-2">
                {BADGES.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBadge(b.id)}
                    className={`px-3.5 py-2.5 text-xs rounded-xl border font-medium transition-all cursor-pointer min-h-[44px] flex items-center justify-center ${
                      selectedBadge === b.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ajuste de tamanho do print */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Tamanho do Print na Arte
                </label>
                <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{imageScale}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={120}
                value={imageScale}
                onChange={e => setImageScale(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 py-2"
              />
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
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-lg shadow-indigo-600/25 cursor-pointer transition-all"
            >
              <span>Ver Prévia & Baixar Story</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Coluna 2: Prévia ao Vivo em Formato Story (9:16) */}
        <div className={`lg:w-1/2 flex flex-col items-center ${mobileView === 'editor' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="w-full max-w-sm lg:sticky lg:top-4 space-y-4">
            {/* Botão de voltar para personalização no Mobile */}
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
              <span className="text-[11px] text-slate-400">1080 × 1920 px</span>
            </div>

            {/* Smartphone Mockup Frame */}
            <div className="relative rounded-[36px] p-3 bg-slate-900 border-4 border-slate-800 shadow-2xl mx-auto w-full max-w-[340px]">
              {/* Notch / Speaker */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-800 rounded-full z-20" />

              {/* Canvas visível escalonado em proporção 9:16 */}
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
              A imagem é gerada em 1080×1920 no padrão do Instagram Stories com máxima nitidez.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
