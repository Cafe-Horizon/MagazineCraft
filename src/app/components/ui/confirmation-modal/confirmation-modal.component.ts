import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" (click)="onCancel()">
      <div 
        class="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden" 
        (click)="$event.stopPropagation()"
      >
        <div class="p-6">
          <h3 class="text-lg font-medium text-zinc-100 mb-2">{{ title }}</h3>
          <p class="text-sm text-zinc-400 whitespace-pre-wrap">{{ message }}</p>
        </div>
        <div class="bg-zinc-950 px-6 py-4 flex justify-end gap-3 border-t border-zinc-800">
          <button 
            type="button"
            class="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors focus:outline-none"
            (click)="onCancel()"
          >
            {{ cancelText }}
          </button>
          <button 
            type="button"
            class="px-4 py-2 text-sm font-medium rounded transition-colors focus:outline-none focus:ring-2"
            [ngClass]="isDangerous ? 
              'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500' : 
              'bg-zinc-100 hover:bg-white text-zinc-900 focus:ring-zinc-400'"
            (click)="onConfirm()"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class ConfirmationModalComponent {
  @Input({ required: true }) title: string = '';
  @Input({ required: true }) message: string = '';
  @Input() confirmText: string = '確定';
  @Input() cancelText: string = 'キャンセル';
  @Input() isDangerous: boolean = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}
