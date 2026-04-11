import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { EditorStateService } from '../../services/editor-state.service';
import * as htmlToImage from 'html-to-image';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule, MatDividerModule],
  templateUrl: './header.component.html'
})
export class HeaderComponent {
  editorService = inject(EditorStateService);

  toggleLeftSidebar() {
    this.editorService.toggleLeftSidebar();
  }

  toggleRightSidebar() {
    this.editorService.toggleRightSidebar();
  }

  exportData() {
    this.editorService.exportData();
  }

  undo() {
    this.editorService.undo();
  }

  redo() {
    this.editorService.redo();
  }

  canUndo() {
    return this.editorService.undoStack().length > 1;
  }

  canRedo() {
    return this.editorService.redoStack().length > 0;
  }

  zoomIn() {
    this.editorService.zoomIn();
  }

  zoomOut() {
    this.editorService.zoomOut();
  }

  zoomReset() {
    this.editorService.zoomReset();
  }

  reset() {
    this.editorService.confirmReset();
  }

  toggleGrayscale() {
    this.editorService.toggleGrayscale();
  }

  getZoomDisplay(): string {
    if (this.editorService.autoFit()) return 'Auto';
    return Math.round(this.editorService.zoomLevel() * 100) + '%';
  }

  triggerFileInput(input: HTMLInputElement) {
    input.click();
  }

  importData(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          
          if (file.name.toLowerCase().endsWith('.svg')) {
            this.editorService.importFromSvg(content);
          }
        } catch (error) {
          console.error('Error parsing imported data:', error);
          alert('インポートに失敗しました。ファイル形式が正しいか確認してください。');
        }
      };
      
      reader.readAsText(file);
    }
    input.value = '';
  }

  async downloadImage() {
    this.editorService.deselectAll();
    
    // Wait a tick for UI to update (deselection)
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const canvasContainer = document.getElementById('main-canvas');
    if (canvasContainer) {
      const originalTransform = canvasContainer.style.transform;
      const originalTop = canvasContainer.style.top;
      const originalLeft = canvasContainer.style.left;
      const originalPosition = canvasContainer.style.position;
      
      try {
        // Temporarily reset styles to ensure 1:1 scale and 0,0 position for high-quality capture
        // We also need to clear top/left as html-to-image may include them in the capture area
        canvasContainer.style.transform = 'none';
        canvasContainer.style.top = '0';
        canvasContainer.style.left = '0';
        
        const width = this.editorService.canvasWidth();
        const height = this.editorService.canvasHeight();

        const dataUrl = await htmlToImage.toPng(canvasContainer, {
          quality: 1.0,
          pixelRatio: 2, 
          width: width,
          height: height,
          style: {
            transform: 'none',
            left: '0',
            top: '0',
            margin: '0',
            position: 'relative' // Ensure relative to its own capture box
          }
        });
        
        const link = document.createElement('a');
        link.download = `magazine-cover-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (error) {
        console.error('Error generating image:', error);
        alert('画像の生成中にエラーが発生しました。');
      } finally {
        // Restore original styles
        canvasContainer.style.transform = originalTransform;
        canvasContainer.style.top = originalTop;
        canvasContainer.style.left = originalLeft;
        canvasContainer.style.position = originalPosition;
      }
    }
  }
}
