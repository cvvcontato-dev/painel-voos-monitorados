import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  UploadCloud, Download, Copy, Check, Sparkles, Image as ImageIcon,
  Trash2, Camera, Palette, ArrowLeft, ArrowRight, Eye, Settings, Sliders,
  MessageSquare, Heart, Bookmark, Send, User, Compass, PlaneTakeoff, Home,
  Maximize2, Move, RotateCcw, LayoutTemplate, Layers
} from 'lucide-react';
import defaultLogo from '../assets/logo-oficial.png';

// ── PRESETS MODO 1: PRINT DE WHATSAPP (FEEDBACK) ───────────────────────────
const PRESET_TITLES = [
  'Que alegria receber esse feedback! ✈️',
  'Mais um sonho realizado com sucesso! 💙✨',
  'Gratidão imensa pela confiança! 🌴✈️',
  'Viajar sem preocupação não tem preço! 🧳💫'
];

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

// ── PRESETS MODO 2: FOTOS DE CLIENTES NO EMBARQUE / VIAGEM (INSTAGRAM REPOST) ─
const REPOST_CATEGORIES = [
  {
    id: 'embarque',
    label: 'Embarque / Ida',
    icon: PlaneTakeoff,
    tag: 'CLIENTES QUERIDOS EMBARCANDO HOJE ✈️',
    messages: [
      'Boa viagem, {nome}! ✈️✨ Que seu destino seja repleto de momentos incríveis. Agradecemos sua confiança em nosso trabalho e por nos permitir fazer parte dessa jornada!',
      'Que sua viagem seja leve, cheia de descobertas e momentos inesquecíveis! ✈️✨ Boa viagem, {nome} 😉',
      'Clientes queridos embarcando nesta tarde! ✈️✨ Muito obrigado pela confiança no Clube do Voo Viagens. Que seja uma jornada memorável!'
    ]
  },
  {
    id: 'primeira_viagem',
    label: 'Primeira Viagem',
    icon: Compass,
    tag: 'PRIMEIRA VIAGEM DE AVIÃO ✈️✨',
    messages: [
      'Primeira viagem de avião a gente nunca esquece... e a gente também não! Obrigado por nos deixar fazer parte desse momento tão especial! 💙✨✈️ Que seja um momento incrível, {nome}! Aproveite muito!',
      'A emoção da primeira decolagem é única! Parabéns pela conquista, {nome}! Estamos muito felizes em realizar esse sonho com você! ☁️✈️'
    ]
  },
  {
    id: 'retorno',
    label: 'Retorno para Casa',
    icon: Home,
    tag: 'NOSSO CLIENTE E AMIGO RETORNANDO ✈️',
    messages: [
      'Viajar é maravilhoso, ainda mais quando é de férias e para reencontrar quem amamos. Mas nada como voltar para casa! Ótima viagem de retorno, {nome}, e até a próxima aventura! ✈️',
      'Muito obrigado pela confiança no Clube do Voo Viagens. Ótimo retorno para casa, {nome}! Malas cheias de lembranças inesquecíveis 💙'
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

// Helper para desenhar texto com espaçamento uniforme entre letras
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

// Helper para desenhar um coração preenchido ou contornado
function drawHeart(ctx, x, y, size, fill = true) {
  ctx.save();
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(x, y + topCurveHeight);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + size, x, y + size);
  ctx.bezierCurveTo(x, y + size, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
  ctx.closePath();
  if (fill) { ctx.fill(); } else { ctx.stroke(); }
  ctx.restore();
}

// Helper para desenhar balão de comentário
function drawChatBubble(ctx, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
  ctx.moveTo(x - size * 0.22, y + size * 0.32);
  ctx.lineTo(x - size * 0.42, y + size * 0.52);
  ctx.lineTo(x - size * 0.05, y + size * 0.38);
  ctx.stroke();
  ctx.restore();
}

// Helper para desenhar aviãozinho de papel (direct / share)
function drawPaperPlane(ctx, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.42, y - size * 0.38);
  ctx.lineTo(x + size * 0.46, y);
  ctx.lineTo(x - size * 0.42, y + size * 0.38);
  ctx.lineTo(x - size * 0.18, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Helper para desenhar ícone de bookmark (salvar)
function drawBookmark(ctx, x, y, size) {
  ctx.save();
  ctx.beginPath();
  const w = size * 0.62;
  const h = size * 0.88;
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.lineTo(x, y + h * 0.2);
  ctx.lineTo(x - w / 2, y + h / 2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Helper para desenhar o rastro de avião em coração no topo direito
function drawHeartPlaneTrail(ctx, startX, startY) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(startX - 25, startY - 30, startX - 55, startY + 5, startX, startY + 35);
  ctx.bezierCurveTo(startX + 55, startY + 5, startX + 25, startY - 30, startX, startY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX, startY + 35);
  ctx.bezierCurveTo(startX + 30, startY + 55, startX + 80, startY + 30, startX + 105, startY - 15);
  ctx.stroke();

  const px = startX + 112;
  const py = startY - 22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + 28, py);
  ctx.lineTo(px - 14, py - 20);
  ctx.lineTo(px - 6, py - 5);
  ctx.lineTo(px - 24, py - 8);
  ctx.lineTo(px - 20, py);
  ctx.lineTo(px - 24, py + 8);
  ctx.lineTo(px - 6, py + 5);
  ctx.lineTo(px - 14, py + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Quebra texto em linhas baseado na largura máxima
function wrapText(ctx, text, maxWidth) {
  const words = (text || '').trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (let w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function DepoimentosTab({ showToast }) {
  // Modo de Story: 'feedback' (Print WhatsApp) | 'repost' (Foto na Viagem / Moldura Instagram)
  const [storyMode, setStoryMode] = useState('repost');

  // Alternância mobile entre Personalização e Prévia
  const [mobileView, setMobileView] = useState('editor'); // 'editor' | 'preview'

  // Estados dos Arquivos e Imagens
  const [printImage, setPrintImage] = useState(null);       // Print do WhatsApp (Modo 1)
  const [bgImage, setBgImage] = useState(null);             // Foto de fundo dos clientes
  const [clientPhoto, setClientPhoto] = useState(null);     // Foto dos passageiros (Modo 2)
  const [logoImgObj, setLogoImgObj] = useState(null);       // Logo oficial da agência

  // Estados do Modo 1 (Feedback / Print)
  const [storyTitle, setStoryTitle] = useState(PRESET_TITLES[0]);
  const [storyMessage, setStoryMessage] = useState(PRESET_MESSAGES[0].items[0]);
  const [imageScale, setImageScale] = useState(100);

  // Estados do Modo 2 (Embarque / Repost Instagram)
  const [clientName, setClientName] = useState('Zélia e família');
  const [repostTag, setRepostTag] = useState('CLIENTES QUERIDOS EMBARCANDO HOJE ✈️');
  const [repostMessage, setRepostMessage] = useState(
    'Boa viagem, Zélia e família! ✈️✨ Que seu destino seja repleto de momentos incríveis. Agradecemos sua confiança em nosso trabalho e por nos permitir fazer parte dessa jornada!'
  );
  const [activeCategory, setActiveCategory] = useState('embarque');

  // Controles de Enquadramento Inteligente e Formato da Moldura
  const [frameFormat, setFrameFormat] = useState('auto');       // 'auto' | 'landscape' (4:3) | 'square' (1:1) | 'portrait' (4:5)
  const [fitMode, setFitMode] = useState('cover');              // 'cover' (preencher) | 'contain' (sem cortes)
  const [photoZoom, setPhotoZoom] = useState(100);              // Zoom: 70% a 180%
  const [photoOffsetX, setPhotoOffsetX] = useState(0);          // Ajuste Horizontal: -250px a +250px
  const [photoOffsetY, setPhotoOffsetY] = useState(0);          // Ajuste Vertical: -250px a +250px
  const [stickerPos, setStickerPos] = useState('auto');         // 'auto' | 'bottom-card' | 'overlay'
  const [showTopTag, setShowTopTag] = useState(true);           // Exibir sticker superior
  const [blueIntensity, setBlueIntensity] = useState(82);       // 60 a 95% de opacidade do azul sobre a foto de fundo

  const [generating, setGenerating] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Refs para inputs
  const printInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const clientPhotoInputRef = useRef(null);
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

  // Carrega imagem do print (Modo 1)
  const handlePrintFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
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

  // Carrega foto dos passageiros (Modo 2) com detecção inteligente de proporção
  const handleClientPhotoFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setClientPhoto(img);
        if (!bgImage) setBgImage(img);

        // Auto-detecta se a foto é horizontal ou vertical para sugerir a melhor experiência
        const ratio = img.width / img.height;
        if (ratio >= 1.18) {
          showToast?.('Foto horizontal detectada! Moldura adaptada automaticamente.', 'success');
        } else {
          showToast?.('Foto dos clientes carregada na moldura!', 'success');
        }
        // Reseta offsets para centralizar
        setPhotoOffsetX(0);
        setPhotoOffsetY(0);
        setPhotoZoom(100);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [bgImage, showToast]);

  // Carrega foto de fundo customizada
  const handleBgFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setBgImage(img);
        showToast?.('Foto de fundo aplicada com sucesso!', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [showToast]);

  // Suporte a Ctrl+V para colar imagem direto
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (storyMode === 'feedback') {
            handlePrintFile(file);
          } else {
            handleClientPhotoFile(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [storyMode, handlePrintFile, handleClientPhotoFile]);

  // Aplica preset do Modo Repost
  const applyRepostPreset = (category, msgTemplate) => {
    setActiveCategory(category.id);
    setRepostTag(category.tag);
    const finalMsg = msgTemplate.replace(/\{nome\}/g, clientName || 'querido amigo');
    setRepostMessage(finalMsg);
  };

  // ── RENDERIZADOR DO CANVAS (1080 × 1920) ──────────────────────────────────
  const drawStory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    const activeBg = storyMode === 'repost' ? (clientPhoto || bgImage) : bgImage;

    // 1. FUNDO: Foto com overlay azul escuro OU degradê institucional
    if (activeBg) {
      const canvasRatio = W / H;
      const photoRatio = activeBg.width / activeBg.height;
      let sW, sH, sX, sY;

      if (photoRatio > canvasRatio) {
        sH = activeBg.height;
        sW = activeBg.height * canvasRatio;
        sX = (activeBg.width - sW) / 2;
        sY = 0;
      } else {
        sW = activeBg.width;
        sH = activeBg.width / canvasRatio;
        sX = 0;
        sY = (activeBg.height - sH) / 2;
      }
      ctx.drawImage(activeBg, sX, sY, sW, sH, 0, 0, W, H);

      const alpha = blueIntensity / 100;
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
      overlayGrad.addColorStop(0, `rgba(0, 86, 158, ${alpha})`);
      overlayGrad.addColorStop(0.5, `rgba(40, 100, 180, ${alpha * 0.95})`);
      overlayGrad.addColorStop(1, `rgba(10, 115, 176, ${alpha})`);
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, W, H);
    } else {
      const brandGrad = ctx.createLinearGradient(0, 0, 0, H);
      brandGrad.addColorStop(0, '#00569e');
      brandGrad.addColorStop(0.48, '#2563ab');
      brandGrad.addColorStop(0.78, '#3871c1');
      brandGrad.addColorStop(1, '#0a73b0');
      ctx.fillStyle = brandGrad;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(W / 2, 450, 60, W / 2, 450, 650);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // ────────────────────────────────────────────────────────────────────────
    // MODO 1: PRINT DE WHATSAPP (FEEDBACK)
    // ────────────────────────────────────────────────────────────────────────
    if (storyMode === 'feedback') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 115px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.17)';
      drawSpacedText(ctx, 'FEEDBACK', W / 2, 130, 24);
      drawSpacedText(ctx, 'FEEDBACK', W / 2, 1830, 24);

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

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 22;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
        ctx.clip();
        ctx.drawImage(printImage, drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        drawRoundRect(ctx, drawX, drawY, drawW, drawH, 28);
        ctx.stroke();
      } else {
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

      const textStartY = Math.max(cardBottomY + 70, 1120);
      ctx.font = 'bold 44px "Georgia", "Times New Roman", serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(storyTitle.trim(), W / 2, textStartY);

      ctx.font = 'bold 32px "Georgia", "Times New Roman", serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      const lines = wrapText(ctx, storyMessage, 840);
      const messageStartY = textStartY + 64;
      const lineHeight = 50;
      lines.forEach((line, idx) => {
        ctx.fillText(line, W / 2, messageStartY + (idx * lineHeight));
      });

      const textBottomY = messageStartY + (lines.length * lineHeight);
      const logoAreaCenterY = Math.min(Math.max(textBottomY + 90, 1530), 1640);
      const logoSize = 150;

      if (logoImgObj && logoImgObj.complete) {
        ctx.drawImage(logoImgObj, (W - logoSize) / 2, logoAreaCenterY - logoSize / 2, logoSize, logoSize);
      }
      return;
    }

    // ────────────────────────────────────────────────────────────────────────
    // MODO 2: FOTOS DE CLIENTES NO EMBARQUE / VIAGEM (MOLDURA INSTAGRAM REPOST)
    // ────────────────────────────────────────────────────────────────────────

    // 2. Elemento do Topo Direito: Coração com rastro de aviãozinho (🤍✈️)
    drawHeartPlaneTrail(ctx, 880, 115);

    // 3. Faixa Vertical Direita "✈ REPOST REPOST"
    const stripeW = 120;
    const stripeX = W - stripeW; // 960 a 1080
    const stripeY = 1180;
    const stripeH = 500;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    drawRoundRect(ctx, stripeX, stripeY, stripeW + 10, stripeH, 20);
    ctx.fill();

    const circleCenterX = stripeX + stripeW / 2;
    const circleCenterY = stripeY + 68;
    ctx.fillStyle = '#00569e';
    ctx.beginPath();
    ctx.arc(circleCenterX, circleCenterY, 36, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(circleCenterX + 16, circleCenterY);
    ctx.lineTo(circleCenterX - 10, circleCenterY - 14);
    ctx.lineTo(circleCenterX - 4, circleCenterY - 4);
    ctx.lineTo(circleCenterX - 18, circleCenterY - 6);
    ctx.lineTo(circleCenterX - 14, circleCenterY);
    ctx.lineTo(circleCenterX - 18, circleCenterY + 6);
    ctx.lineTo(circleCenterX - 4, circleCenterY + 4);
    ctx.lineTo(circleCenterX - 10, circleCenterY + 14);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(circleCenterX, stripeY + 230);
    ctx.rotate(Math.PI / 2);
    ctx.font = '900 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.letterSpacing = '8px';
    ctx.fillStyle = '#00569e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('REPOST', 0, 0);
    ctx.fillText('REPOST', 135, 0);
    ctx.restore();
    ctx.restore();

    // 4. CÁLCULO INTELIGENTE DO FORMATO DA MOLDURA (Adaptativo para fotos horizontais ou verticais)
    const imgRatio = clientPhoto ? (clientPhoto.width / clientPhoto.height) : 1.0;
    let effectiveFormat = frameFormat;
    if (effectiveFormat === 'auto') {
      if (imgRatio >= 1.18) effectiveFormat = 'landscape';      // 4:3 Horizontal
      else if (imgRatio >= 0.92) effectiveFormat = 'square';     // 1:1 Quadrada
      else effectiveFormat = 'portrait';                         // 4:5 Vertical
    }

    const frameW = 860;
    const frameX = 40;
    const photoPad = 20;
    const photoW = frameW - (photoPad * 2); // 820px
    let photoH;
    let frameY;

    if (effectiveFormat === 'landscape') {
      photoH = 615; // Proporção 4:3 perfeita para fotos deitadas/selfies horizontais
      frameY = 320;
    } else if (effectiveFormat === 'square') {
      photoH = 820; // 1:1 Quadrada
      frameY = 240;
    } else {
      photoH = 1060; // 4:5 Retrato clássico
      frameY = 160;
    }

    const barH = 74;
    const frameH = photoPad + photoH + barH + 16;
    const photoX = frameX + photoPad;
    const photoY = frameY + photoPad;
    const photoRadius = 24;

    // Sombra suave sob a moldura branca
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = 45;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    drawRoundRect(ctx, frameX, frameY, frameW, frameH, 32);
    ctx.fill();
    ctx.restore();

    // Borda branca pura
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    drawRoundRect(ctx, frameX, frameY, frameW, frameH, 32);
    ctx.fill();

    // 5. DESENHO DA FOTO NA MOLDURA (com suporte a Fit/Cover, Zoom e Deslocamento X e Y)
    if (clientPhoto) {
      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
      ctx.clip();

      // Fundo branco interno da moldura
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(photoX, photoY, photoW, photoH);

      const targetRatio = photoW / photoH;
      const zoom = photoZoom / 100;
      let dW, dH;

      if (fitMode === 'contain') {
        // Modo Foto Completa (Sem Cortes)
        if (imgRatio > targetRatio) {
          dW = photoW * zoom;
          dH = (clientPhoto.height / clientPhoto.width) * dW;
        } else {
          dH = photoH * zoom;
          dW = (clientPhoto.width / clientPhoto.height) * dH;
        }
      } else {
        // Modo Preencher (Cover)
        if (imgRatio > targetRatio) {
          dH = photoH * zoom;
          dW = (clientPhoto.width / clientPhoto.height) * dH;
        } else {
          dW = photoW * zoom;
          dH = (clientPhoto.height / clientPhoto.width) * dW;
        }
      }

      const dX = photoX + (photoW - dW) / 2 + photoOffsetX;
      const dY = photoY + (photoH - dH) / 2 + photoOffsetY;

      ctx.drawImage(clientPhoto, dX, dY, dW, dH);
      ctx.restore();
    } else {
      // Placeholder elegante se ainda não enviou a foto
      ctx.save();
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      drawRoundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
      ctx.fill();

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      drawRoundRect(ctx, photoX + 30, photoY + 30, photoW - 60, photoH - 60, 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.fillStyle = '#00569e';
      ctx.fillText('Envie a foto dos passageiros aqui', photoX + photoW / 2, photoY + photoH / 2 - 25);
      ctx.font = '24px -apple-system, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('(Vertical ou horizontal — adaptamos automaticamente)', photoX + photoW / 2, photoY + photoH / 2 + 25);
      ctx.restore();
    }

    // 6. BARRA DE ENGAJAMENTO INFERIOR (Estilo Instagram)
    const barY = frameY + frameH - 48;
    ctx.save();
    ctx.strokeStyle = '#00569e';
    ctx.fillStyle = '#00569e';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawHeart(ctx, frameX + 68, barY - 14, 32, true);
    drawChatBubble(ctx, frameX + 138, barY - 2, 32);
    drawPaperPlane(ctx, frameX + 210, barY - 2, 34);

    if (clientName) {
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(clientName.trim(), frameX + 265, barY - 2);
    }

    drawBookmark(ctx, frameX + frameW - 65, barY - 2, 32);
    ctx.restore();

    // 7. STICKERS / ADESIVOS DE TEXTO FLUTUANTES (Estilo Instagram Story)

    // A) STICKER SUPERIOR (Tag de Destaque / Embarque)
    if (showTopTag && repostTag.trim()) {
      ctx.save();
      ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const tagText = repostTag.trim();
      const tagPadX = 24;
      const tagPadY = 16;
      const tagW = ctx.measureText(tagText).width + tagPadX * 2;
      const tagH = 58;

      // Se a moldura for horizontal, a tag fica elegante no topo do Story (y: 220px)
      // Se for vertical, sobrepõe no topo da moldura
      let tagX = frameX + 35;
      let tagY = effectiveFormat === 'landscape' ? (frameY - tagH - 25) : (frameY + 35);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;

      ctx.fillStyle = '#e8f2fc';
      ctx.beginPath();
      drawRoundRect(ctx, tagX, tagY, tagW, tagH, 16);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#004782';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, tagX + tagPadX, tagY + tagH / 2);
      ctx.restore();
    }

    // B) STICKER PRINCIPAL DE MENSAGEM
    if (repostMessage.trim()) {
      ctx.save();

      // Posição inteligente:
      // Se a moldura for horizontal (landscape) ou quadrada (square), posiciona ABAIXO da moldura
      // para NUNCA tampar o rosto de quem está na foto!
      // Se for vertical (portrait), posiciona sobreposto no canto inferior da foto.
      let effectiveStickerPos = stickerPos;
      if (effectiveStickerPos === 'auto') {
        effectiveStickerPos = effectiveFormat === 'portrait' ? 'overlay' : 'bottom-card';
      }

      if (effectiveStickerPos === 'bottom-card') {
        // Card amplo e elegante ABAIXO da moldura
        const msgPadX = 36;
        const msgPadY = 28;
        const maxMsgW = 780; // Largura nobre
        ctx.font = 'bold 27px "Georgia", "Times New Roman", serif';

        const msgLines = wrapText(ctx, repostMessage, maxMsgW);
        const lineH = 42;
        const boxH = (msgLines.length * lineH) + (msgPadY * 2);

        let actualMaxTextW = 0;
        for (let l of msgLines) {
          const lw = ctx.measureText(l).width;
          if (lw > actualMaxTextW) actualMaxTextW = lw;
        }
        const boxW = Math.min(Math.max(actualMaxTextW + (msgPadX * 2), 680), 860);
        const boxX = frameX + (frameW - boxW) / 2;
        const boxY = frameY + frameH + 30; // 30px abaixo da moldura

        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 10;

        ctx.fillStyle = '#e3effa';
        ctx.beginPath();
        drawRoundRect(ctx, boxX, boxY, boxW, boxH, 24);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#003d73';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        msgLines.forEach((line, idx) => {
          ctx.fillText(line, boxX + boxW / 2, boxY + msgPadY + (idx * lineH));
        });
      } else {
        // Card sobreposto no canto inferior direito da foto
        const msgPadX = 28;
        const msgPadY = 22;
        const maxMsgW = 540;
        ctx.font = 'bold 26px "Georgia", "Times New Roman", serif';

        const msgLines = wrapText(ctx, repostMessage, maxMsgW);
        const lineH = 38;
        const boxH = (msgLines.length * lineH) + (msgPadY * 2);

        let actualMaxTextW = 0;
        for (let l of msgLines) {
          const lw = ctx.measureText(l).width;
          if (lw > actualMaxTextW) actualMaxTextW = lw;
        }
        const boxW = actualMaxTextW + (msgPadX * 2);

        const boxX = frameX + frameW - boxW - 25;
        const boxY = (photoY + photoH) - boxH - 15;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;

        ctx.fillStyle = '#e3effa';
        ctx.beginPath();
        drawRoundRect(ctx, boxX, boxY, boxW, boxH, 20);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#003d73';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        msgLines.forEach((line, idx) => {
          ctx.fillText(line, boxX + msgPadX, boxY + msgPadY + (idx * lineH));
        });
      }

      ctx.restore();
    }

    // 8. LOGO OFICIAL DA AGÊNCIA (Centralizada na base)
    const logoY = 1620;
    const logoSize = 145;
    if (logoImgObj && logoImgObj.complete) {
      const logoX = (frameX + frameW) / 2 - logoSize / 2;
      ctx.drawImage(logoImgObj, logoX, logoY, logoSize, logoSize);
    } else {
      ctx.font = 'bold 26px -apple-system, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('CLUBE DO VOO VIAGENS', (frameX + frameW) / 2, logoY + 60);
    }

  }, [
    storyMode, printImage, bgImage, clientPhoto, logoImgObj,
    storyTitle, storyMessage, imageScale,
    clientName, repostTag, repostMessage,
    frameFormat, fitMode, photoZoom, photoOffsetX, photoOffsetY, stickerPos, showTopTag, blueIntensity
  ]);

  useEffect(() => {
    drawStory();
  }, [drawStory]);

  // Download do Story em alta resolução (1080 × 1920 PNG)
  const handleDownloadStory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (storyMode === 'feedback' && !printImage) {
      showToast?.('Selecione um print do WhatsApp antes de baixar', 'error');
      return;
    }
    if (storyMode === 'repost' && !clientPhoto) {
      showToast?.('Selecione a foto dos clientes antes de baixar', 'error');
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
        const tag = storyMode === 'repost' ? 'Embarque-Clientes' : 'Feedback';
        a.download = `Story-${tag}-${(clientName || 'ClubeDoVoo').replace(/\s+/g, '-')}-${Date.now()}.png`;
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
    let caption = '';
    if (storyMode === 'repost') {
      caption = `✈️ ${clientName || 'Nossos queridos clientes'} embarcando com a Clube do Voo Viagens!\n\n` +
        `"${repostMessage}"\n\n` +
        `Ver a alegria dos nossos passageiros no momento do embarque é o que nos move todos os dias! Que essa jornada seja inesquecível! 💙🌍\n\n` +
        `Planejando sua próxima viagem? Fale com a nossa equipe no link da bio e viaje com tranquilidade e suporte humanizado! 📲✈️\n\n` +
        `#clubedovoo #clientesviajando #embarque #repost #viagens #ferias #turismo #passagensaereas`;
    } else {
      caption = `${storyTitle}\n\n` +
        `"${storyMessage}"\n\n` +
        `Cuidar de cada etapa da sua viagem com atenção, carinho e o melhor suporte é a nossa maior satisfação! 💙✈️\n\n` +
        `Quer viajar com tranquilidade e as melhores tarifas? Fale conosco no link da bio! 💬📲\n\n` +
        `#clubedovoo #depoimento #avaliacaocliente #feedback #viagens #passagensaereas #turismo`;
    }

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
      {/* ── SELETOR PRINCIPAL DE MODELO DE STORY ────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStoryMode('repost')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
              storyMode === 'repost'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block leading-tight">📸 Foto no Aeroporto / Voo</span>
              <span className="text-[10px] opacity-80 font-normal hidden sm:block">Moldura Adaptativa (Vertical ou Horizontal)</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStoryMode('feedback')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
              storyMode === 'feedback'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <span className="block leading-tight">💬 Print de Depoimento</span>
              <span className="text-[10px] opacity-80 font-normal hidden sm:block">WhatsApp + Marca FEEDBACK</span>
            </div>
          </button>
        </div>
      </div>

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
          {((storyMode === 'repost' && clientPhoto) || (storyMode === 'feedback' && printImage)) && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-220px)]">
        {/* Coluna 1: Controles e Uploads */}
        <div className={`lg:w-1/2 flex flex-col gap-5 min-w-0 ${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'}`}>

          {/* ═══════════════════════════════════════════════════════════════════
              PAINEL MODO 2: FOTO DE CLIENTES / REPOST INSTAGRAM
             ═══════════════════════════════════════════════════════════════════ */}
          {storyMode === 'repost' ? (
            <>
              {/* Bloco 1: Foto do Cliente & Enquadramento */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <div className="flex items-center justify-between min-h-[44px]">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                      <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      1. Foto dos Passageiros
                    </h3>
                    <p className="text-xs text-slate-400">
                      Suporta fotos em pé, deitadas (selfies horizontais) ou quadradas
                    </p>
                  </div>
                  {clientPhoto && (
                    <button
                      type="button"
                      onClick={() => setClientPhoto(null)}
                      className="min-h-[44px] px-2 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <Trash2 className="w-4 h-4" /> Remover
                    </button>
                  )}
                </div>

                <div
                  onClick={() => clientPhotoInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-5 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30 hover:bg-indigo-50/30"
                >
                  {clientPhoto ? (
                    <div className="flex items-center justify-center gap-3">
                      <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Foto carregada ({clientPhoto.width}×{clientPhoto.height}px)! Clique para trocar.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <ImageIcon className="w-8 h-8 mx-auto text-indigo-500" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Selecione a foto enviada pelo cliente
                      </p>
                      <p className="text-xs text-slate-400">
                        Arraste aqui ou cole com <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">Ctrl+V</kbd>
                      </p>
                    </div>
                  )}
                  <input
                    ref={clientPhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleClientPhotoFile(e.target.files?.[0])}
                    className="hidden"
                  />
                </div>

                {/* Seletor de Formato da Moldura */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <LayoutTemplate className="w-3.5 h-3.5" /> Formato da Moldura do Instagram
                    </span>
                    {clientPhoto && (
                      <span className="text-[10px] font-normal text-slate-400 font-mono">
                        Foto: {clientPhoto.width > clientPhoto.height ? 'Horizontal' : 'Vertical'}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setFrameFormat('auto')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        frameFormat === 'auto'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>⚡ Auto (Ideal)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFrameFormat('landscape')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        frameFormat === 'landscape'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="text-base leading-none">📷</span>
                      <span>Horizontal (4:3)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFrameFormat('square')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        frameFormat === 'square'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="text-base leading-none">⬛</span>
                      <span>Quadrada (1:1)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFrameFormat('portrait')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        frameFormat === 'portrait'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="text-base leading-none">📱</span>
                      <span>Vertical (4:5)</span>
                    </button>
                  </div>
                </div>

                {/* Modo de Encaixe (Preencher vs Sem Cortes) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" /> Encaixe da Foto
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFitMode('cover')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        fitMode === 'cover'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <span>🖼️ Preencher Moldura</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFitMode('contain')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        fitMode === 'contain'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950/70 dark:border-indigo-500 dark:text-indigo-200 font-bold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <span>🔍 Foto Inteira (Sem Cortes)</span>
                    </button>
                  </div>
                </div>

                {/* Ajustes Finos de Posição e Zoom */}
                {clientPhoto && (
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-indigo-500" /> Ajuste Fino de Enquadramento
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoOffsetX(0);
                          setPhotoOffsetY(0);
                          setPhotoZoom(100);
                        }}
                        className="text-[11px] text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 cursor-pointer"
                        title="Resetar enquadramento"
                      >
                        <RotateCcw className="w-3 h-3" /> Centralizar
                      </button>
                    </div>

                    {/* Deslocamento Horizontal X */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 dark:text-slate-300">Posição Horizontal (Esquerda / Direita)</span>
                        <span className="font-mono text-indigo-600 font-semibold">{photoOffsetX}px</span>
                      </div>
                      <input
                        type="range"
                        min={-250}
                        max={250}
                        value={photoOffsetX}
                        onChange={e => setPhotoOffsetX(parseInt(e.target.value, 10))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    {/* Deslocamento Vertical Y */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 dark:text-slate-300">Posição Vertical (Cima / Baixo)</span>
                        <span className="font-mono text-indigo-600 font-semibold">{photoOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min={-250}
                        max={250}
                        value={photoOffsetY}
                        onChange={e => setPhotoOffsetY(parseInt(e.target.value, 10))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>

                    {/* Zoom */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600 dark:text-slate-300">Zoom da Imagem</span>
                        <span className="font-mono text-indigo-600 font-semibold">{photoZoom}%</span>
                      </div>
                      <input
                        type="range"
                        min={70}
                        max={180}
                        value={photoZoom}
                        onChange={e => setPhotoZoom(parseInt(e.target.value, 10))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bloco 2: Textos, Nome & Mensagem */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  2. Dados do Passageiro & Mensagem
                </h3>

                {/* Nome do Cliente / Família */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Nome do Cliente ou Família (Aparece na barra do Instagram)
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Ex: Zélia e família, Jonatas, Ane, Vanessa..."
                    className="w-full px-3.5 py-2.5 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 min-h-[44px]"
                  />
                </div>

                {/* Seletor de Categorias / Presets Rápidos */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                    Sugestões de Mensagens por Ocasião
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {REPOST_CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      const isCatActive = activeCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => applyRepostPreset(cat, cat.messages[0])}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                            isCatActive
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 dark:bg-indigo-950/60 dark:border-indigo-600 dark:text-indigo-200 font-bold'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:border-slate-700/60 dark:text-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-[11px] leading-tight">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Lista de frases da categoria ativa */}
                  <div className="space-y-1.5">
                    {REPOST_CATEGORIES.find(c => c.id === activeCategory)?.messages.map((msg, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyRepostPreset(REPOST_CATEGORIES.find(c => c.id === activeCategory), msg)}
                        className={`w-full text-left p-2.5 rounded-lg text-xs transition-all border cursor-pointer ${
                          repostMessage === msg.replace(/\{nome\}/g, clientName || 'querido amigo')
                            ? 'bg-indigo-50/80 border-indigo-300 text-indigo-900 dark:bg-indigo-950/50 dark:border-indigo-500 dark:text-indigo-200 font-medium'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {msg.replace(/\{nome\}/g, clientName || 'querido amigo')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sticker Principal (Edição Livre) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Texto do Adesivo Principal
                  </label>
                  <textarea
                    rows={3}
                    value={repostMessage}
                    onChange={e => setRepostMessage(e.target.value)}
                    className="w-full p-3 text-base md:text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed min-h-[80px]"
                  />
                </div>

                {/* Posicionamento do Sticker de Mensagem */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Posição do Adesivo de Mensagem
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setStickerPos('auto')}
                      className={`p-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        stickerPos === 'auto'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ⚡ Auto (Inteligente)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStickerPos('bottom-card')}
                      className={`p-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        stickerPos === 'bottom-card'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      📜 Abaixo da Moldura
                    </button>
                    <button
                      type="button"
                      onClick={() => setStickerPos('overlay')}
                      className={`p-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        stickerPos === 'overlay'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🏷️ Sobre a Foto
                    </button>
                  </div>
                </div>

                {/* Sticker Superior Opcional (Tag) */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={showTopTag}
                        onChange={e => setShowTopTag(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      Exibir Adesivo de Destaque no Topo
                    </label>
                  </div>
                  {showTopTag && (
                    <input
                      type="text"
                      value={repostTag}
                      onChange={e => setRepostTag(e.target.value)}
                      placeholder="Ex: CLIENTES QUERIDOS EMBARCANDO HOJE ✈️"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ═══════════════════════════════════════════════════════════════════
               PAINEL MODO 1: PRINT WHATSAPP (FEEDBACK)
               ═══════════════════════════════════════════════════════════════════ */
            <>
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
                        Print carregado! Clique para trocar ou cole com Ctrl+V.
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

              {/* Bloco 2: Textos do Story (Modo Feedback) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  2. Textos do Story (Abaixo do Print)
                </h3>

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
            </>
          )}

          {/* Bloco Comum: Foto de Fundo Customizada & Intensidade do Azul */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between min-h-[44px]">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-base">
                  <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  3. Ajuste do Fundo Azul Monocromático
                </h3>
                <p className="text-xs text-slate-400">
                  {bgImage || (storyMode === 'repost' && clientPhoto)
                    ? 'Foto aplicada com tonalização azul da marca'
                    : 'Fundo com degradê oficial Clube do Voo'}
                </p>
              </div>
              {bgImage && (
                <button
                  type="button"
                  onClick={() => setBgImage(null)}
                  className="min-h-[44px] px-2 text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Resetar fundo
                </button>
              )}
            </div>

            <div>
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
                disabled={generating || (storyMode === 'repost' && !clientPhoto) || (storyMode === 'feedback' && !printImage)}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all min-h-[48px] cursor-pointer ${
                  generating || (storyMode === 'repost' && !clientPhoto) || (storyMode === 'feedback' && !printImage)
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
