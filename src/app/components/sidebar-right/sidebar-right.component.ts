import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { EditorStateService, TextElement, ImageElement, ShapeElement } from '../../services/editor-state.service';

@Component({
  selector: 'app-sidebar-right',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './sidebar-right.component.html'
})
export class SidebarRightComponent {
  editorService = inject(EditorStateService);

  // Fonts
  fonts = [
    { name: 'Noto Sans JP', value: 'var(--font-sans)' },
    { name: 'Noto Serif JP', value: 'var(--font-serif)' },
    { name: 'Yusei Magic', value: 'var(--font-magic)' },
    { name: 'M PLUS Rounded 1c', value: 'var(--font-rounded)' },
    { name: 'Dela Gothic One (極太)', value: 'var(--font-dela)' },
    { name: 'Yuji Syuku (筆文字)', value: 'var(--font-yuji)' },
  ];

  toggleRightSidebar() {
    this.editorService.toggleRightSidebar();
  }

  getGroupName(groupId: string): string {
    return this.editorService.getGroupName(groupId);
  }

  updateGroupName(groupId: string, name: string) {
    this.editorService.updateGroupName(groupId, name);
  }

  isGroupLocked(groupId: string): boolean {
    return this.editorService.isGroupLocked(groupId);
  }

  setGroupLock(groupId: string, locked: boolean) {
    this.editorService.setGroupLock(groupId, locked);
  }

  hasLockedSelectedElements(): boolean {
    return this.editorService.hasLockedSelectedElements();
  }

  alignSelected(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    this.editorService.alignSelected(alignment);
  }

  ungroupSelected() {
    this.editorService.ungroupSelected();
  }

  groupSelected() {
    this.editorService.groupSelected();
  }

  reorderSelected(direction: 'up' | 'down' | 'top' | 'bottom') {
    this.editorService.reorderSelected(direction);
  }

  updateTextElement(id: string, updates: Partial<TextElement>) {
    this.editorService.updateTextElement(id, updates);
  }

  updateImageElement(id: string, updates: Partial<ImageElement>) {
    this.editorService.updateImageElement(id, updates);
  }

  updateShapeElement(id: string, updates: Partial<ShapeElement>) {
    this.editorService.updateShapeElement(id, updates);
  }

  updateCanvasWidth(width: number) {
    if (width >= 100 && width <= 4000) {
      this.editorService.canvasWidth.set(width);
    }
  }

  updateCanvasHeight(height: number) {
    if (height >= 100 && height <= 4000) {
      this.editorService.canvasHeight.set(height);
    }
  }

  deleteSelected() {
    this.editorService.deleteSelected();
  }
}
