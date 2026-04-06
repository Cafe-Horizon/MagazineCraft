import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EditorStateService, TextElement } from '../../services/editor-state.service';

@Component({
  selector: 'app-sidebar-left',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './sidebar-left.component.html'
})
export class SidebarLeftComponent {
  editorService = inject(EditorStateService);

  // Presets
  presets: { name: string, style: Partial<TextElement> }[] = [
    { name: 'タイトル (極太/白/黒フチ)', style: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 4, textShadow: '4px 4px 0 #000', fontSize: 120, fontFamily: 'var(--font-dela)', fontWeight: '400', scaleY: 1.2 } },
    { name: '見出し (赤/白背景)', style: { color: '#ff0000', backgroundColor: '#ffffff', fontSize: 60, fontWeight: '900', padding: 4 } },
    { name: '見出し (黄/黒背景)', style: { color: '#ffff00', backgroundColor: '#000000', fontSize: 60, fontWeight: '900', padding: 4 } },
    { name: '縦書き (筆文字/黒)', style: { color: '#000000', writingMode: 'vertical-rl', fontSize: 60, fontFamily: 'var(--font-yuji)', fontWeight: '400', strokeWidth: 0, textShadow: 'none' } },
    { name: '縦書き (白/黒フチ)', style: { color: '#ffffff', writingMode: 'vertical-rl', fontSize: 40, fontWeight: '900', strokeColor: '#000000', strokeWidth: 2, textShadow: '2px 2px 0 #000' } },
    { name: '縦書き (黄/黒フチ)', style: { color: '#ffff00', writingMode: 'vertical-rl', fontSize: 40, fontWeight: '900', strokeColor: '#000000', strokeWidth: 2, textShadow: '2px 2px 0 #000' } },
    { name: '縦書き (赤/白フチ)', style: { color: '#ff0000', writingMode: 'vertical-rl', fontSize: 40, fontWeight: '900', strokeColor: '#ffffff', strokeWidth: 2, textShadow: '2px 2px 0 #fff' } },
    { name: '小見出し (黒/白背景)', style: { color: '#000000', backgroundColor: '#ffffff', fontSize: 24, fontWeight: '700', padding: 2 } },
  ];

  handleBackgroundUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.editorService.backgroundImage.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    (event.target as HTMLInputElement).value = '';
  }

  handleImageUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          let width = img.naturalWidth;
          let height = img.naturalHeight;

          // Limit initial size if too large while maintaining aspect ratio
          const maxInitialSize = 800;
          if (width > maxInitialSize || height > maxInitialSize) {
            const ratio = Math.min(maxInitialSize / width, maxInitialSize / height);
            width *= ratio;
            height *= ratio;
          }

          this.editorService.addImage(src, width, height);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
    (event.target as HTMLInputElement).value = '';
  }

  addText() {
    this.editorService.addText();
  }

  addShape() {
    this.editorService.addShape();
  }

  applyPreset(preset: { name: string, style: Partial<TextElement> }) {
    const selected = this.editorService.selectedElement();
    if (selected && selected.type === 'text') {
      this.editorService.updateTextElement(selected.data.id, preset.style);
    } else {
      // If no text element is selected, add a new one with the preset style
      this.editorService.addText(preset.style);
    }
  }

  selectElement(id: string, event: Event) {
    if (event) event.stopPropagation();
    const isMulti = event && ((event as MouseEvent).shiftKey || (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
    this.editorService.selectElement(id, isMulti);
  }

  selectGroup(groupId: string, event: Event) {
    if (event) event.stopPropagation();
    const isMulti = event && ((event as MouseEvent).shiftKey || (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey);
    this.editorService.selectGroup(groupId, isMulti);
  }

  toggleGroup(groupId: string, event: Event) {
    event.stopPropagation();
    this.editorService.toggleGroup(groupId);
  }

  toggleLock(id: string, event: Event) {
    event.stopPropagation();
    this.editorService.toggleLock(id);
  }

  reorderNode(id: string, direction: 'up' | 'down', event: Event) {
    event.stopPropagation();
    this.editorService.reorderNode(id, direction);
  }

  confirmDelete(id: string, event: Event) {
    event.stopPropagation();
    this.editorService.confirmDelete(id);
  }
}
