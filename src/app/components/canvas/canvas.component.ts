import { Component, ElementRef, ViewChild, inject, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EditorStateService } from '../../services/editor-state.service';

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas.component.html'
})
export class CanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: false }) canvasContainer!: ElementRef;
  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;
  
  editorService = inject(EditorStateService);
  isInitialized = signal(false);
  Math = Math;

  containerWidth = signal(0);
  containerHeight = signal(0);
  private resizeObserver: ResizeObserver | null = null;

  private snapTargetsX: number[] = [];
  private snapTargetsY: number[] = [];
  private draggedElWidth = 0;
  private draggedElHeight = 0;

  ngAfterViewInit() {
    // We observe the parent of the wrapper (which is the scrollable <main> element)
    const parent = this.canvasContainer?.nativeElement?.parentElement?.parentElement;
    if (parent) {
      this.containerWidth.set(parent.clientWidth);
      this.containerHeight.set(parent.clientHeight);
      
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          // Use clientWidth/Height to account for scrollbars correctly
          const target = entry.target as HTMLElement;
          this.containerWidth.set(target.clientWidth);
          this.containerHeight.set(target.clientHeight);

          // Trigger initial centering as soon as dimensions are confirmed
          if (!this.isInitialized() && target.clientWidth > 0) {
            // Delay slightly to allow Angular to reflect signal changes in the DOM
            setTimeout(() => this.centerCanvas(), 50);
          }
        }
      });
      this.resizeObserver.observe(parent);
    }
  }

  private centerCanvas() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement as HTMLElement;
      
      // Use requestAnimationFrame to ensure we read the latest layout values
      requestAnimationFrame(() => {
        const scrollX = (el.scrollWidth - el.clientWidth) / 2;
        const scrollY = (el.scrollHeight - el.clientHeight) / 2;
        
        el.scrollTo({
          left: Math.max(0, scrollX),
          top: Math.max(0, scrollY),
          behavior: 'auto'
        });

        // Ensure initialization signal is set only after scroll is attempted
        requestAnimationFrame(() => {
          this.isInitialized.set(true);
        });
      });
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private computeSnapTargets(excludeIds: string[], scale: number) {
    this.snapTargetsX = [0, this.editorService.canvasWidth() / 2, this.editorService.canvasWidth()];
    this.snapTargetsY = [0, this.editorService.canvasHeight() / 2, this.editorService.canvasHeight()];
    
    const allElements = [
      ...this.editorService.textElements(), 
      ...this.editorService.imageElements(), 
      ...this.editorService.shapeElements()
    ];
    
    for (const otherEl of allElements) {
      if (excludeIds.includes(otherEl.id)) continue;
      const node = document.getElementById('el-' + otherEl.id);
      if (node) {
        const rect = node.getBoundingClientRect();
        const w = rect.width * scale;
        const h = rect.height * scale;
        this.snapTargetsX.push(otherEl.x, otherEl.x + w / 2, otherEl.x + w);
        this.snapTargetsY.push(otherEl.y, otherEl.y + h / 2, otherEl.y + h);
      }
    }
  }

  getScaleValue(): number {
    if (!this.editorService.autoFit()) {
      return this.editorService.zoomLevel();
    }
    
    const pWidth = this.containerWidth();
    const pHeight = this.containerHeight();
    
    // Fallback to window size only if container hasn't been measured yet
    const parentWidth = pWidth > 0 ? pWidth : window.innerWidth;
    const parentHeight = pHeight > 0 ? pHeight : window.innerHeight;
    
    const scaleX = Math.max(0.1, (parentWidth - 64) / this.editorService.canvasWidth());
    const scaleY = Math.max(0.1, (parentHeight - 64) / this.editorService.canvasHeight());
    return Math.min(1, scaleX, scaleY);
  }

  getTransformScale(): string {
    return `scale(${this.getScaleValue()})`;
  }

  onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault(); // Prevent browser zoom
      if (event.deltaY < 0) {
        this.editorService.zoomIn();
      } else {
        this.editorService.zoomOut();
      }
    }
  }

  updateTextContent(id: string, event: Event) {
    const target = event.target as HTMLElement;
    if (target) {
      this.editorService.updateTextElement(id, { text: target.innerText });
    }
  }

  onMouseDown(event: MouseEvent, id: string) {
    event.stopPropagation();
    
    if (!this.editorService.selectedElementIds().includes(id)) {
      this.editorService.selectElement(id, false);
    }
    
    const anyLocked = this.editorService.selectedElementIds().some(selId => {
      const el = this.editorService.allElements().find(e => e.id === selId);
      return el?.locked;
    });
    if (anyLocked) return;
    
    this.editorService.isDragging.set(true);
    this.editorService.dragStartX.set(event.clientX);
    this.editorService.dragStartY.set(event.clientY);
    
    const positions = new Map<string, {x: number, y: number}>();
    for (const selId of this.editorService.selectedElementIds()) {
      const el = this.editorService.allElements().find(e => e.id === selId);
      if (el) positions.set(selId, {x: el.x, y: el.y});
    }
    this.editorService.dragStartPositions.set(positions);

    if (this.canvasContainer) {
      const canvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();
      const scale = this.editorService.canvasWidth() / canvasRect.width;
      this.computeSnapTargets(this.editorService.selectedElementIds(), scale);
      
      if (this.editorService.selectedElementIds().length === 1) {
        const primaryId = this.editorService.selectedElementIds()[0];
        const draggedElNode = document.getElementById('el-' + primaryId);
        if (draggedElNode) {
          const draggedRect = draggedElNode.getBoundingClientRect();
          this.draggedElWidth = draggedRect.width * scale;
          this.draggedElHeight = draggedRect.height * scale;
        }
      }
    }
  }

  onResizeStart(event: Event, id: string) {
    event.stopPropagation();
    this.editorService.selectElement(id, false);
    
    const anyLocked = this.editorService.selectedElementIds().some(selId => {
      const el = this.editorService.allElements().find(e => e.id === selId);
      return el?.locked;
    });
    if (anyLocked) return;

    this.editorService.isResizing.set(true);
    if (event instanceof MouseEvent) {
      this.editorService.resizeStartX.set(event.clientX);
      this.editorService.resizeStartY.set(event.clientY);
    } else {
      const selected = this.editorService.selectedElement();
      if (selected) {
        this.editorService.resizeStartX.set(selected.data.x);
        this.editorService.resizeStartY.set(selected.data.y);
      }
    }
    
    const selected = this.editorService.selectedElement();
    if (selected && (selected.type === 'image' || selected.type === 'shape')) {
      this.editorService.elementStartWidth.set(selected.data.width);
      this.editorService.elementStartHeight.set(selected.data.height);
    }

    if (this.canvasContainer && selected) {
      const canvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();
      const scale = this.editorService.canvasWidth() / canvasRect.width;
      this.computeSnapTargets([selected.data.id], scale);
    }
  }

  onMouseMove(event: MouseEvent) {
    if (!this.editorService.isDragging() && !this.editorService.isResizing()) return;

    if (!this.canvasContainer) return;
    const canvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();
    const scale = this.editorService.canvasWidth() / canvasRect.width;

    if (this.editorService.isDragging()) {
      const rawDx = event.clientX - this.editorService.dragStartX();
      const rawDy = event.clientY - this.editorService.dragStartY();
      
      let finalDx = rawDx * scale;
      let finalDy = rawDy * scale;

      this.editorService.horizontalGuide.set(null);
      this.editorService.verticalGuide.set(null);

      if (this.editorService.selectedElementIds().length === 1) {
        const primaryId = this.editorService.selectedElementIds()[0];
        const startPos = this.editorService.dragStartPositions().get(primaryId);
        const el = this.editorService.allElements().find(e => e.id === primaryId);
        
        if (startPos && el) {
          let newX = startPos.x + finalDx;
          let newY = startPos.y + finalDy;
          
          const snapThreshold = 5 * scale;
          const draggedWidth = this.draggedElWidth;
          const draggedHeight = this.draggedElHeight;
          const draggedCenterX = newX + draggedWidth / 2;
          const draggedCenterY = newY + draggedHeight / 2;

          for (const targetX of this.snapTargetsX) {
            if (Math.abs(newX - targetX) < snapThreshold) {
              newX = targetX;
              this.editorService.verticalGuide.set(targetX);
              break;
            } else if (Math.abs(draggedCenterX - targetX) < snapThreshold) {
              newX = targetX - draggedWidth / 2;
              this.editorService.verticalGuide.set(targetX);
              break;
            } else if (Math.abs(newX + draggedWidth - targetX) < snapThreshold) {
              newX = targetX - draggedWidth;
              this.editorService.verticalGuide.set(targetX);
              break;
            }
          }

          for (const targetY of this.snapTargetsY) {
            if (Math.abs(newY - targetY) < snapThreshold) {
              newY = targetY;
              this.editorService.horizontalGuide.set(targetY);
              break;
            } else if (Math.abs(draggedCenterY - targetY) < snapThreshold) {
              newY = targetY - draggedHeight / 2;
              this.editorService.horizontalGuide.set(targetY);
              break;
            } else if (Math.abs(newY + draggedHeight - targetY) < snapThreshold) {
              newY = targetY - draggedHeight;
              this.editorService.horizontalGuide.set(targetY);
              break;
            }
          }
          finalDx = newX - startPos.x;
          finalDy = newY - startPos.y;
        }
      }

      for (const selId of this.editorService.selectedElementIds()) {
        const el = this.editorService.allElements().find(e => e.id === selId);
        if (el && !el.locked) {
          const startPos = this.editorService.dragStartPositions().get(selId);
          if (startPos) {
            const newX = startPos.x + finalDx;
            const newY = startPos.y + finalDy;
            if (el.type === 'text') this.editorService.updateTextElement(selId, { x: newX, y: newY });
            else if (el.type === 'image') this.editorService.updateImageElement(selId, { x: newX, y: newY });
            else if (el.type === 'shape') this.editorService.updateShapeElement(selId, { x: newX, y: newY });
          }
        }
      }
    } else if (this.editorService.isResizing()) {
      const dx = event.clientX - this.editorService.resizeStartX();
      const dy = event.clientY - this.editorService.resizeStartY();
      
      const selected = this.editorService.selectedElement();
      if (selected && !selected.data.locked && (selected.type === 'image' || selected.type === 'shape')) {
        let newWidth = Math.max(20, this.editorService.elementStartWidth() + dx * scale);
        let newHeight = Math.max(20, this.editorService.elementStartHeight() + dy * scale);
        
        this.editorService.horizontalGuide.set(null);
        this.editorService.verticalGuide.set(null);
        
        const snapThreshold = 5 * scale;
        
        const rightEdge = selected.data.x + newWidth;
        const centerX = selected.data.x + newWidth / 2;
        
        for (const targetX of this.snapTargetsX) {
          if (Math.abs(rightEdge - targetX) < snapThreshold) {
            newWidth = targetX - selected.data.x;
            this.editorService.verticalGuide.set(targetX);
            break;
          } else if (Math.abs(centerX - targetX) < snapThreshold) {
            newWidth = (targetX - selected.data.x) * 2;
            this.editorService.verticalGuide.set(targetX);
            break;
          }
        }
        
        const bottomEdge = selected.data.y + newHeight;
        const centerY = selected.data.y + newHeight / 2;
        
        for (const targetY of this.snapTargetsY) {
          if (Math.abs(bottomEdge - targetY) < snapThreshold) {
            newHeight = targetY - selected.data.y;
            this.editorService.horizontalGuide.set(targetY);
            break;
          } else if (Math.abs(centerY - targetY) < snapThreshold) {
            newHeight = (targetY - selected.data.y) * 2;
            this.editorService.horizontalGuide.set(targetY);
            break;
          }
        }
        
        newWidth = Math.max(20, newWidth);
        newHeight = Math.max(20, newHeight);

        if (selected.type === 'image') {
          this.editorService.updateImageElement(selected.data.id, { width: newWidth, height: newHeight });
        } else if (selected.type === 'shape') {
          this.editorService.updateShapeElement(selected.data.id, { width: newWidth, height: newHeight });
        }
      }
    }
  }

  onMouseUp() {
    this.editorService.isDragging.set(false);
    this.editorService.isResizing.set(false);
    this.editorService.horizontalGuide.set(null);
    this.editorService.verticalGuide.set(null);
  }

  deselectAll() {
    this.editorService.deselectAll();
  }

  // Touch handlers
  onTouchStart(event: TouchEvent, id: string) {
    if (event.touches.length > 1) return;
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    this.onMouseDown(mouseEvent, id);
  }

  onResizeTouchStart(event: TouchEvent, id: string) {
    if (event.touches.length > 1) return;
    const touch = event.touches[0];
    this.editorService.selectElement(id, false);
    
    const anyLocked = this.editorService.selectedElementIds().some(selId => {
      const el = this.editorService.allElements().find(e => e.id === selId);
      return el?.locked;
    });
    if (anyLocked) return;

    this.editorService.isResizing.set(true);
    this.editorService.resizeStartX.set(touch.clientX);
    this.editorService.resizeStartY.set(touch.clientY);
    
    const selected = this.editorService.selectedElement();
    if (selected && (selected.type === 'image' || selected.type === 'shape')) {
      this.editorService.elementStartWidth.set(selected.data.width);
      this.editorService.elementStartHeight.set(selected.data.height);
    }
    
    if (this.canvasContainer && selected) {
      const canvasRect = this.canvasContainer.nativeElement.getBoundingClientRect();
      const scale = this.editorService.canvasWidth() / canvasRect.width;
      this.computeSnapTargets([selected.data.id], scale);
    }
    
    event.preventDefault();
  }

  onTouchMove(event: TouchEvent) {
    if (event.touches.length > 1) return;
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    this.onMouseMove(mouseEvent);
    if (this.editorService.isDragging() || this.editorService.isResizing()) {
      event.preventDefault();
    }
  }

  onTouchEnd() {
    this.onMouseUp();
  }
}
