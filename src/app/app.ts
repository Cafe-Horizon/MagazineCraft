import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EditorStateService } from './services/editor-state.service';
import { HeaderComponent } from './components/header/header.component';
import { SidebarLeftComponent } from './components/sidebar-left/sidebar-left.component';
import { SidebarRightComponent } from './components/sidebar-right/sidebar-right.component';
import { CanvasComponent } from './components/canvas/canvas.component';
import { ConfirmationModalComponent } from './components/ui/confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, MatIconModule, HeaderComponent, SidebarLeftComponent, SidebarRightComponent, CanvasComponent, ConfirmationModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  editorService = inject(EditorStateService);

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Some browsers might not report application/json properly for local files, so check extension too
      if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
        this.handleJsonFile(file);
      } else if (file.type.startsWith('image/')) {
        this.handleImageFile(file);
      }
    }
  }

  private handleJsonFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        this.editorService.applyData(data);
      } catch (err) {
        console.error('Failed to parse dropped JSON', err);
      }
    };
    reader.readAsText(file);
  }

  private handleImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      if (url) {
        this.editorService.addImage(url);
      }
    };
    reader.readAsDataURL(file);
  }

  cancelDelete() {
    this.editorService.cancelDelete();
  }

  executeDelete() {
    this.editorService.executeDelete();
  }

  cancelReset() {
    this.editorService.cancelReset();
  }

  executeReset() {
    this.editorService.resetToInitial();
    this.editorService.cancelReset();
  }
}
