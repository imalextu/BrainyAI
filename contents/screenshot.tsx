import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import html2canvas from 'html2canvas';

// 创建截图组件
const ScreenshotComponent = ({ 
  onComplete, 
  onCancel 
}: { 
  onComplete: (imageData: string) => void, 
  onCancel: () => void 
}) => {
  const [crop, setCrop] = useState<Crop>();
  const [isCropSelected, setIsCropSelected] = useState(false);
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 在组件挂载时创建透明背景图
  useEffect(() => {
    createTransparentImage();
  }, []);
  
  // 创建一个透明的背景图，使ReactCrop能够正常工作
  const createTransparentImage = () => {
    // 创建一个与屏幕大小相同的透明canvas
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // 设置为完全透明
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 转换为base64数据
      const transparentImageData = canvas.toDataURL('image/png');
      setScreenshotImage(transparentImageData);
    }
  };
  
  // 完成截图
  const handleComplete = useCallback(() => {
    if (!crop || !containerRef.current) return;
    
    // 获取选择区域的位置和尺寸
    const { x, y, width, height } = crop;
    
    // 只在用户选择了区域后才进行截图
    const captureSelectedArea = async () => {
      try {
        // 计算实际的截图区域（相对于整个文档）
        const absoluteX = window.scrollX + x;
        const absoluteY = window.scrollY + y;
        
        // 使用html2canvas截取指定区域
        const canvas = await html2canvas(document.body, {
          allowTaint: true,
          useCORS: true,
          x: absoluteX,
          y: absoluteY,
          width: width,
          height: height,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight
        });
        
        // 转换为Base64
        const imageData = canvas.toDataURL('image/png');
        onComplete(imageData);
      } catch (error) {
        console.error("截图失败:", error);
        onCancel();
      }
    };
    
    captureSelectedArea();
  }, [crop, onComplete, onCancel]);
  
  // 处理裁剪区域变化
  const handleCropChange = (c: Crop) => {
    setCrop(c);
    // 当用户开始选择区域且有宽度和高度时，设置为已选择状态
    if (c.width && c.height) {
      setIsCropSelected(true);
    } else {
      setIsCropSelected(false);
    }
  };
  
  return (
    <div 
      ref={containerRef}
      className="screenshot-container" 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.1)',
        pointerEvents: 'auto'
      }}
    >
      {screenshotImage && (
        <ReactCrop
          crop={crop}
          onChange={handleCropChange}
          ruleOfThirds
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
        >
          <img 
            ref={imgRef} 
            src={screenshotImage} 
            alt="截图背景" 
            style={{ 
              width: '100%', 
              height: '100%',
              opacity: 0.1, // 几乎透明，只是为了让ReactCrop能工作
              pointerEvents: 'auto'
            }} 
          />
        </ReactCrop>
      )}
      
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          cursor: 'crosshair'
        }}
      />
      
      {isCropSelected && (
        <div className="screenshot-controls" style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '10px',
          zIndex: 10000
        }}>
          <button 
            onClick={handleComplete}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0A4DFE',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            确认
          </button>
          <button 
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#5E5E5E',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
};

// 创建一个容器元素，用于挂载截图组件
function createScreenshotRoot() {
  // 检查是否已经存在截图容器，如果存在则移除它
  const existingRoot = document.getElementById('brainy-ai-screenshot-root');
  if (existingRoot) {
    existingRoot.remove();
  }
  
  const root = document.createElement('div');
  root.id = 'brainy-ai-screenshot-root';
  document.body.appendChild(root);
  return root;
}

// 监听来自插件的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "START_SCREENSHOT") {
    const rootElement = createScreenshotRoot();
    
    // 使用React 18的createRoot API
    const reactRoot = createRoot(rootElement);
    reactRoot.render(
      <ScreenshotComponent 
        onComplete={(imageData) => {
          // 将截图数据发送回插件
          chrome.runtime.sendMessage({
            action: "SCREENSHOT_COMPLETED",
            imageData
          });
          
          // 清理DOM
          reactRoot.unmount();
          rootElement.remove();
        }}
        onCancel={() => {
          // 通知插件截图已取消
          chrome.runtime.sendMessage({
            action: "SCREENSHOT_CANCELLED"
          });
          
          // 清理DOM
          reactRoot.unmount();
          rootElement.remove();
        }}
      />
    );
    
    return true; // 保持消息通道开放，以便异步回复
  }
});