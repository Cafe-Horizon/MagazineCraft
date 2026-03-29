import { Component, inject } from '@angular/core';
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
