import { Injectable, signal, computed, effect, inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface BaseElement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  groupId?: string;
  locked: boolean;
}

export interface TextElement extends BaseElement {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  fontWeight: string;
  writingMode: 'horizontal-tb' | 'vertical-rl';
  textShadow: string;
  strokeColor: string;
  strokeWidth: number;
  scaleX: number;
  scaleY: number;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  padding: number;
}

export interface ImageElement extends BaseElement {
  src: string;
  width: number;
  height: number;
}

export interface ShapeElement extends BaseElement {
  type: 'rectangle';
  width: number;
  height: number;
  backgroundColor: string;
}

export interface GroupMeta {
  id: string;
  name: string;
  isExpanded: boolean;
}

export interface LayerNode {
  isGroup: boolean;
  id: string;
  name?: string;
  isExpanded?: boolean;
  locked?: boolean;
  hasLockedChildren?: boolean;
  children?: LayerNode[];
  type?: string;
  text?: string;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class EditorStateService {
  Math = Math;

  // State
  backgroundImage = signal<string | null>(null);
  textElements = signal<TextElement[]>([]);
  imageElements = signal<ImageElement[]>([]);
  shapeElements = signal<ShapeElement[]>([]);
  groups = signal<GroupMeta[]>([]);
  selectedElementIds = signal<string[]>([]);
  
  // Canvas settings
  canvasWidth = signal(1600);
  canvasHeight = signal(2262); // A4 ratio (doubled)
  
  // Dragging state
  isDragging = signal(false);
  dragStartX = signal(0);
  dragStartY = signal(0);
  dragStartPositions = signal<Map<string, {x: number, y: number}>>(new Map());
  elementStartX = signal(0);
  elementStartY = signal(0);

  // Resizing state
  isResizing = signal(false);
  resizeStartX = signal(0);
  resizeStartY = signal(0);
  elementStartWidth = signal(0);
  elementStartHeight = signal(0);

  // Snapping guides
  horizontalGuide = signal<number | null>(null);
  verticalGuide = signal<number | null>(null);

  // Delete confirmation modal
  showDeleteConfirm = signal(false);
  deleteTarget = signal<string | 'selected' | null>(null);

  // Mobile state
  showLeftSidebar = signal(true);
  showRightSidebar = signal(true);
  isMobile = signal(false);

  // Undo / Redo state
  undoStack = signal<string[]>([]);
  redoStack = signal<string[]>([]);
  isStateRestoring = false;

  // Zoom state (not saved in document data)
  zoomLevel = signal(1); // 1 = 100%
  autoFit = signal(true); 

  private platformId = inject(PLATFORM_ID);
  private ngZone = inject(NgZone);
  
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.checkMobile();
      window.addEventListener('resize', () => this.checkMobile());

      if ('launchQueue' in window) {
        (window as any).launchQueue.setConsumer(async (launchParams: any) => {
          if (!launchParams.files || !launchParams.files.length) {
            return;
          }
          const fileHandle = launchParams.files[0];
          try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data) {
              this.ngZone.run(() => {
                this.loadSnapshot(data);
              });
            }
          } catch (e) {
            console.error('Failed to load file from launchQueue', e);
          }
        });
      }

      const savedData = localStorage.getItem('magazine-cover-data');
      if (savedData) {
        try {
          const data = JSON.parse(savedData);
          if (data.backgroundImage) this.backgroundImage.set(data.backgroundImage);
          
          const ensureLocked = (els: any[]) => els.map(e => ({ ...e, locked: e.locked ?? false }));
          
          if (data.textElements) this.textElements.set(ensureLocked(data.textElements));
          if (data.imageElements) this.imageElements.set(ensureLocked(data.imageElements));
          if (data.shapeElements) this.shapeElements.set(ensureLocked(data.shapeElements));
          if (data.groups) this.groups.set(data.groups);
          if (data.canvasWidth) {
            // If the saved width is the old default (800), update it to the new default (1600)
            const width = data.canvasWidth === 800 ? 1600 : data.canvasWidth;
            this.canvasWidth.set(width);
          }
          if (data.canvasHeight) {
            // If the saved height is the old default (1131), update it to the new default (2262)
            const height = data.canvasHeight === 1131 ? 2262 : data.canvasHeight;
            this.canvasHeight.set(height);
          }
        } catch (e) {
          console.error('Failed to load saved data', e);
        }
      }
    }

    // Save data to localStorage whenever state changes
    effect(() => {
      const data = {
        backgroundImage: this.backgroundImage(),
        textElements: this.textElements(),
        imageElements: this.imageElements(),
        shapeElements: this.shapeElements(),
        groups: this.groups(),
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight()
      };
      
      const serialized = JSON.stringify(data);

      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem('magazine-cover-data', serialized);
        } catch (e) {
          console.warn('Failed to save data to localStorage (possibly quota exceeded)', e);
        }

        // Record to undo stack
        if (!this.isStateRestoring && !this.isDragging() && !this.isResizing()) {
          const uStack = this.undoStack();
          if (uStack.length === 0 || uStack[uStack.length - 1] !== serialized) {
            const newStack = [...uStack, serialized];
            if (newStack.length > 50) newStack.shift(); // Limit history to 50 states
            this.undoStack.set(newStack);
            this.redoStack.set([]); // clear redo stack on new action
          }
        }
      }
    }, { allowSignalWrites: true });

    if (isPlatformBrowser(this.platformId)) {
      // Keyboard shortcuts for Undo / Redo
      window.addEventListener('keydown', (e) => {
        // Allow default copy/paste/etc, only block targeted shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          this.redo();
          e.preventDefault();
        }
        
        // Zoom shortcuts
        if ((e.ctrlKey || e.metaKey)) {
          if (e.key === '=' || e.key === '+') {
            this.zoomIn();
            e.preventDefault();
          } else if (e.key === '-') {
            this.zoomOut();
            e.preventDefault();
          } else if (e.key === '0') {
            this.zoomReset();
            e.preventDefault();
          }
        }
      }, { passive: false });
    }
  }

  // Zoom methods
  zoomIn() {
    this.autoFit.set(false);
    this.zoomLevel.update(z => Math.round(Math.min(5, z + 0.1) * 10) / 10);
  }

  zoomOut() {
    this.autoFit.set(false);
    this.zoomLevel.update(z => Math.round(Math.max(0.1, z - 0.1) * 10) / 10);
  }

  zoomReset() {
    this.autoFit.set(true);
    this.zoomLevel.set(1);
  }

  setZoom(level: number) {
    this.autoFit.set(false);
    this.zoomLevel.set(Math.round(Math.min(5, Math.max(0.1, level)) * 10) / 10);
  }

  // Computed properties
  selectedElement = computed(() => {
    const ids = this.selectedElementIds();
    if (ids.length !== 1) return null;
    const id = ids[0];
    
    const textEl = this.textElements().find(e => e.id === id);
    if (textEl) return { type: 'text' as const, data: textEl };
    
    const imgEl = this.imageElements().find(e => e.id === id);
    if (imgEl) return { type: 'image' as const, data: imgEl };
    
    const shapeEl = this.shapeElements().find(e => e.id === id);
    if (shapeEl) return { type: 'shape' as const, data: shapeEl };
    
    return null;
  });

  selectedGroupId = computed(() => {
    const ids = this.selectedElementIds();
    if (ids.length === 0) return null;
    const elements = this.allElements().filter(e => ids.includes(e.id));
    const firstGroupId = elements[0].groupId;
    if (!firstGroupId) return null;
    
    const allSameGroup = elements.every(e => e.groupId === firstGroupId);
    if (!allSameGroup) return null;

    const groupElements = this.allElements().filter(e => e.groupId === firstGroupId);
    if (groupElements.length === elements.length) return firstGroupId;

    return null;
  });

  allElements = computed(() => {
    const texts = this.textElements().map(e => ({ ...e, type: 'text' as const }));
    const images = this.imageElements().map(e => ({ ...e, type: 'image' as const }));
    const shapes = this.shapeElements().map(e => ({ ...e, type: 'shape' as const }));
    
    return [...texts, ...images, ...shapes].sort((a, b) => b.zIndex - a.zIndex);
  });

  layerTree = computed(() => {
    const elements = this.allElements();
    const tree: LayerNode[] = [];
    const processedGroups = new Set<string>();

    for (const el of elements) {
      if (el.groupId) {
        if (!processedGroups.has(el.groupId)) {
          processedGroups.add(el.groupId);
          const groupMeta = this.groups().find(g => g.id === el.groupId);
          const groupElements = elements.filter(e => e.groupId === el.groupId);
          tree.push({
            isGroup: true,
            id: el.groupId,
            name: groupMeta?.name || 'グループ',
            isExpanded: groupMeta?.isExpanded ?? true,
            locked: groupElements.every(e => e.locked),
            hasLockedChildren: groupElements.some(e => e.locked),
            children: groupElements.map(e => ({ isGroup: false, ...e }))
          });
        }
      } else {
        tree.push({
          isGroup: false,
          ...el
        });
      }
    }
    return tree;
  });

  // State Manipulation Methods
  checkMobile() {
    const mobile = window.innerWidth < 1024;
    this.isMobile.set(mobile);
    if (mobile) {
      this.showLeftSidebar.set(false);
      this.showRightSidebar.set(false);
    } else {
      this.showLeftSidebar.set(true);
      this.showRightSidebar.set(true);
    }
  }

  toggleLeftSidebar() {
    this.showLeftSidebar.update(v => !v);
    if (this.isMobile() && this.showLeftSidebar()) {
      this.showRightSidebar.set(false);
    }
  }

  toggleRightSidebar() {
    this.showRightSidebar.update(v => !v);
    if (this.isMobile() && this.showRightSidebar()) {
      this.showLeftSidebar.set(false);
    }
  }

  getMaxZIndex() {
    let max = 0;
    this.textElements().forEach(e => max = Math.max(max, e.zIndex));
    this.imageElements().forEach(e => max = Math.max(max, e.zIndex));
    this.shapeElements().forEach(e => max = Math.max(max, e.zIndex));
    return max;
  }

  addText() {
    const newText: TextElement = {
      id: Math.random().toString(36).substring(2, 9),
      text: '見出しテキスト',
      x: 200,
      y: 200,
      fontSize: 80,
      fontFamily: 'var(--font-sans)',
      color: '#ffffff',
      backgroundColor: 'transparent',
      rotation: 0,
      fontWeight: '900',
      writingMode: 'horizontal-tb',
      textShadow: 'none',
      strokeColor: '#000000',
      strokeWidth: 0,
      scaleX: 1,
      scaleY: 1,
      textAlign: 'left',
      letterSpacing: 0,
      lineHeight: 1.2,
      padding: 0,
      locked: false,
      zIndex: this.getMaxZIndex() + 1
    };
    this.textElements.update(els => [...els, newText]);
    this.selectedElementIds.set([newText.id]);
  }

  addImage(src: string) {
    const newImage: ImageElement = {
      id: Math.random().toString(36).substring(2, 9),
      src,
      x: 400,
      y: 400,
      width: 400,
      height: 400,
      rotation: 0,
      locked: false,
      zIndex: this.getMaxZIndex() + 1
    };
    this.imageElements.update(els => [...els, newImage]);
    this.selectedElementIds.set([newImage.id]);
  }

  addShape() {
    const newShape: ShapeElement = {
      id: Math.random().toString(36).substring(2, 9),
      type: 'rectangle',
      x: 400,
      y: 400,
      width: 400,
      height: 200,
      backgroundColor: '#ff0000',
      rotation: 0,
      locked: false,
      zIndex: this.getMaxZIndex() + 1
    };
    this.shapeElements.update(els => [...els, newShape]);
    this.selectedElementIds.set([newShape.id]);
  }

  updateTextElement(id: string, updates: Partial<TextElement>) {
    this.textElements.update(els => els.map(e => e.id === id ? { ...e, ...updates } : e));
  }

  updateImageElement(id: string, updates: Partial<ImageElement>) {
    this.imageElements.update(els => els.map(e => e.id === id ? { ...e, ...updates } : e));
  }

  updateShapeElement(id: string, updates: Partial<ShapeElement>) {
    this.shapeElements.update(els => els.map(e => e.id === id ? { ...e, ...updates } : e));
  }

  selectElement(id: string, isMulti: boolean) {
    const el = this.allElements().find(e => e.id === id);
    if (!el) return;

    let idsToSelect = [id];
    if (el.groupId) {
      idsToSelect = this.allElements().filter(e => e.groupId === el.groupId).map(e => e.id);
    }

    if (isMulti) {
      const current = this.selectedElementIds();
      const isAlreadySelected = idsToSelect.every(i => current.includes(i));
      if (isAlreadySelected) {
        this.selectedElementIds.set(current.filter(i => !idsToSelect.includes(i)));
      } else {
        this.selectedElementIds.set([...new Set([...current, ...idsToSelect])]);
      }
    } else {
      this.selectedElementIds.set(idsToSelect);
    }
  }

  selectGroup(groupId: string, isMulti: boolean) {
    const idsToSelect = this.allElements().filter(e => e.groupId === groupId).map(e => e.id);
    
    if (isMulti) {
      const current = this.selectedElementIds();
      const isAlreadySelected = idsToSelect.every(i => current.includes(i));
      if (isAlreadySelected) {
        this.selectedElementIds.set(current.filter(i => !idsToSelect.includes(i)));
      } else {
        this.selectedElementIds.set([...new Set([...current, ...idsToSelect])]);
      }
    } else {
      this.selectedElementIds.set(idsToSelect);
    }
  }

  deselectAll() {
    this.selectedElementIds.set([]);
  }

  isGroupSelected(groupId: string) {
    const groupElementIds = this.allElements().filter(e => e.groupId === groupId).map(e => e.id);
    if (groupElementIds.length === 0) return false;
    return groupElementIds.every(id => this.selectedElementIds().includes(id));
  }

  toggleGroup(groupId: string) {
    this.groups.update(gs => gs.map(g => g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g));
  }

  groupSelected() {
    const ids = this.selectedElementIds();
    if (ids.length < 2) return;
    
    const groupId = 'g_' + Math.random().toString(36).substring(2, 9);
    this.groups.update(g => [...g, { id: groupId, name: 'グループ', isExpanded: true }]);
    
    ids.forEach(id => {
      const el = this.allElements().find(e => e.id === id);
      if (el) {
        if (el.type === 'text') this.updateTextElement(id, { groupId });
        else if (el.type === 'image') this.updateImageElement(id, { groupId });
        else if (el.type === 'shape') this.updateShapeElement(id, { groupId });
      }
    });
  }

  ungroupSelected() {
    const groupId = this.selectedGroupId();
    if (!groupId) return;
    
    const ids = this.allElements().filter(e => e.groupId === groupId).map(e => e.id);
    ids.forEach(id => {
      const el = this.allElements().find(e => e.id === id);
      if (el) {
        if (el.type === 'text') this.updateTextElement(id, { groupId: undefined });
        else if (el.type === 'image') this.updateImageElement(id, { groupId: undefined });
        else if (el.type === 'shape') this.updateShapeElement(id, { groupId: undefined });
      }
    });
    
    this.groups.update(g => g.filter(group => group.id !== groupId));
  }

  getGroupName(groupId: string): string {
    const group = this.groups().find(g => g.id === groupId);
    return group ? group.name : '';
  }

  updateGroupName(groupId: string, name: string) {
    this.groups.update(gs => gs.map(g => g.id === groupId ? { ...g, name } : g));
  }

  updateElementPosition(id: string, x: number, y: number) {
    const el = this.allElements().find(e => e.id === id);
    if (!el) return;
    if (el.type === 'text') this.updateTextElement(id, { x, y });
    else if (el.type === 'image') this.updateImageElement(id, { x, y });
    else if (el.type === 'shape') this.updateShapeElement(id, { x, y });
  }

  alignSelected(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const ids = this.selectedElementIds();
    if (ids.length < 2) return;

    const elements = this.allElements().filter(e => ids.includes(e.id));
    if (elements.length === 0) return;
    
    if (elements.some(e => e.locked)) return;

    let targetValue = 0;

    switch (alignment) {
      case 'left':
        targetValue = Math.min(...elements.map(e => e.x));
        elements.forEach(el => this.updateElementPosition(el.id, targetValue, el.y));
        break;
      case 'right':
        targetValue = Math.max(...elements.map(e => e.x + (('width' in e) ? e.width : 0)));
        elements.forEach(el => this.updateElementPosition(el.id, targetValue - (('width' in el) ? el.width : 0), el.y));
        break;
      case 'center': {
        const minX = Math.min(...elements.map(e => e.x));
        const maxX = Math.max(...elements.map(e => e.x + (('width' in e) ? e.width : 0)));
        targetValue = minX + (maxX - minX) / 2;
        elements.forEach(el => this.updateElementPosition(el.id, targetValue - (('width' in el) ? el.width : 0) / 2, el.y));
        break;
      }
      case 'top':
        targetValue = Math.min(...elements.map(e => e.y));
        elements.forEach(el => this.updateElementPosition(el.id, el.x, targetValue));
        break;
      case 'bottom':
        targetValue = Math.max(...elements.map(e => e.y + (('height' in e) ? e.height : 0)));
        elements.forEach(el => this.updateElementPosition(el.id, el.x, targetValue - (('height' in el) ? el.height : 0)));
        break;
      case 'middle': {
        const minY = Math.min(...elements.map(e => e.y));
        const maxY = Math.max(...elements.map(e => e.y + (('height' in e) ? e.height : 0)));
        targetValue = minY + (maxY - minY) / 2;
        elements.forEach(el => this.updateElementPosition(el.id, el.x, targetValue - (('height' in el) ? el.height : 0) / 2));
        break;
      }
    }
  }

  deleteLayer(id: string) {
    this.textElements.update(els => els.filter(e => e.id !== id));
    this.imageElements.update(els => els.filter(e => e.id !== id));
    this.shapeElements.update(els => els.filter(e => e.id !== id));
    
    const currentSelected = this.selectedElementIds();
    if (currentSelected.includes(id)) {
      this.selectedElementIds.set(currentSelected.filter(i => i !== id));
    }
  }

  executeDelete() {
    const target = this.deleteTarget();
    if (target === 'selected') {
      const ids = this.selectedElementIds();
      ids.forEach(id => {
        const el = this.allElements().find(e => e.id === id);
        if (el && !el.locked) {
          this.deleteLayer(id);
        }
      });
      this.deselectAll();
    } else if (target) {
      const el = this.allElements().find(e => e.id === target);
      if (el && !el.locked) {
        this.deleteLayer(target);
      } else if (!el) {
        const group = this.groups().find(g => g.id === target);
        if (group) {
          const groupElements = this.allElements().filter(e => e.groupId === target);
          if (!groupElements.some(e => e.locked)) {
            groupElements.forEach(e => this.deleteLayer(e.id));
            this.groups.update(g => g.filter(gr => gr.id !== target));
          }
        }
      }
    }
    this.showDeleteConfirm.set(false);
    this.deleteTarget.set(null);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deleteTarget.set(null);
  }

  deleteSelected() {
    const ids = this.selectedElementIds();
    const hasUnlocked = ids.some(id => {
      const el = this.allElements().find(e => e.id === id);
      return el && !el.locked;
    });
    if (hasUnlocked) {
      this.deleteTarget.set('selected');
      this.showDeleteConfirm.set(true);
    }
  }

  confirmDelete(target: string) {
    this.deleteTarget.set(target);
    this.showDeleteConfirm.set(true);
  }

  private applyLayerOrder(tree: LayerNode[]) {
    let currentZ = 1;
    const reversedTree = [...tree].reverse();
    for (const node of reversedTree) {
      if (node.isGroup) {
        const children = [...(node.children || [])].reverse();
        for (const child of children) {
          this.updateElementZIndex(child.id, child.type, currentZ++);
        }
      } else {
        this.updateElementZIndex(node.id, node.type, currentZ++);
      }
    }
  }

  reorderNode(id: string, direction: 'up' | 'down') {
    const tree = [...this.layerTree()];
    const index = tree.findIndex(n => n.id === id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = tree[index];
      tree[index] = tree[index - 1];
      tree[index - 1] = temp;
    } else if (direction === 'down' && index < tree.length - 1) {
      const temp = tree[index];
      tree[index] = tree[index + 1];
      tree[index + 1] = temp;
    } else {
      return;
    }

    this.applyLayerOrder(tree);
  }

  reorderSelected(direction: 'up' | 'down' | 'top' | 'bottom') {
    const selectedIds = this.selectedElementIds();
    if (selectedIds.length === 0) return;

    const getRootId = (id: string) => {
      const el = this.allElements().find(e => e.id === id);
      return (el && el.groupId) ? el.groupId : id;
    };
    
    const selectedRootIds = Array.from(new Set(selectedIds.map(getRootId)));
    const tree = [...this.layerTree()];

    if (direction === 'up') {
      for (let i = 1; i < tree.length; i++) {
        if (selectedRootIds.includes(tree[i].id) && !selectedRootIds.includes(tree[i - 1].id)) {
          const temp = tree[i - 1];
          tree[i - 1] = tree[i];
          tree[i] = temp;
        }
      }
    } else if (direction === 'down') {
      for (let i = tree.length - 2; i >= 0; i--) {
        if (selectedRootIds.includes(tree[i].id) && !selectedRootIds.includes(tree[i + 1].id)) {
          const temp = tree[i + 1];
          tree[i + 1] = tree[i];
          tree[i] = temp;
        }
      }
    } else if (direction === 'top') {
      const selectedNodes = tree.filter(n => selectedRootIds.includes(n.id));
      const otherNodes = tree.filter(n => !selectedRootIds.includes(n.id));
      tree.splice(0, tree.length, ...selectedNodes, ...otherNodes);
    } else if (direction === 'bottom') {
      const selectedNodes = tree.filter(n => selectedRootIds.includes(n.id));
      const otherNodes = tree.filter(n => !selectedRootIds.includes(n.id));
      tree.splice(0, tree.length, ...otherNodes, ...selectedNodes);
    }
    
    this.applyLayerOrder(tree);
  }

  updateElementZIndex(id: string, type: string | undefined, zIndex: number) {
    if (type === 'text') this.updateTextElement(id, { zIndex });
    else if (type === 'image') this.updateImageElement(id, { zIndex });
    else if (type === 'shape') this.updateShapeElement(id, { zIndex });
  }

  isGroupLocked(groupId: string): boolean {
    const groupElements = this.allElements().filter(e => e.groupId === groupId);
    if (groupElements.length === 0) return false;
    return groupElements.every(e => e.locked);
  }

  hasLockedSelectedElements(): boolean {
    const ids = this.selectedElementIds();
    if (ids.length === 0) return false;
    return this.allElements().some(e => ids.includes(e.id) && e.locked);
  }

  setGroupLock(groupId: string, locked: boolean) {
    const groupElements = this.allElements().filter(e => e.groupId === groupId);
    groupElements.forEach(el => {
      if (el.type === 'text') this.updateTextElement(el.id, { locked });
      else if (el.type === 'image') this.updateImageElement(el.id, { locked });
      else if (el.type === 'shape') this.updateShapeElement(el.id, { locked });
    });
  }

  toggleLock(id: string) {
    const group = this.groups().find(g => g.id === id);
    if (group) {
      const groupElements = this.allElements().filter(e => e.groupId === id);
      const allLocked = groupElements.every(e => e.locked);
      const newLockedState = !allLocked;
      
      groupElements.forEach(el => {
        if (el.type === 'text') this.updateTextElement(el.id, { locked: newLockedState });
        else if (el.type === 'image') this.updateImageElement(el.id, { locked: newLockedState });
        else if (el.type === 'shape') this.updateShapeElement(el.id, { locked: newLockedState });
      });
      return;
    }

    const el = this.allElements().find(e => e.id === id);
    if (!el) return;
    
    const newLockedState = !el.locked;
    if (el.type === 'text') this.updateTextElement(id, { locked: newLockedState });
    else if (el.type === 'image') this.updateImageElement(id, { locked: newLockedState });
    else if (el.type === 'shape') this.updateShapeElement(id, { locked: newLockedState });
  }

  exportData() {
    const data = {
      backgroundImage: this.backgroundImage(),
      textElements: this.textElements(),
      imageElements: this.imageElements(),
      shapeElements: this.shapeElements(),
      groups: this.groups(),
      canvasWidth: this.canvasWidth(),
      canvasHeight: this.canvasHeight()
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = 'magazine-cover-data.json';
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  undo() {
    const uStack = this.undoStack();
    if (uStack.length <= 1) return; // Need at least 2 states (current and previous)
    
    this.isStateRestoring = true;
    const currentStateStr = uStack[uStack.length - 1]; // Current state is at top
    const prevStateStr = uStack[uStack.length - 2];
    
    try {
      const data = JSON.parse(prevStateStr);
      this.loadSnapshot(data);
      
      this.redoStack.update(s => [...s, currentStateStr]);
      this.undoStack.set(uStack.slice(0, -1));
    } catch (e) {
      console.error('Failed to parse undo state', e);
    } finally {
      // Allow the next effect cycle to bypass writing to the stack before clearing the flag
      setTimeout(() => this.isStateRestoring = false, 0);
    }
  }

  redo() {
    const rStack = this.redoStack();
    if (rStack.length === 0) return;
    
    this.isStateRestoring = true;
    const nextStateStr = rStack[rStack.length - 1];
    
    try {
      const data = JSON.parse(nextStateStr);
      this.loadSnapshot(data);
      
      this.undoStack.update(s => [...s, nextStateStr]);
      this.redoStack.set(rStack.slice(0, -1));
    } catch (e) {
      console.error('Failed to parse redo state', e);
    } finally {
      setTimeout(() => this.isStateRestoring = false, 0);
    }
  }

  loadSnapshot(data: any) {
    if (data.backgroundImage !== undefined) this.backgroundImage.set(data.backgroundImage);
    
    // Normalize and add fallbacks for missing properties in older saved data
    const processElements = (els: any[], type: string) => {
      if (!Array.isArray(els)) return [];
      return els.map(e => {
        const base = { ...e, locked: e.locked ?? false, rotation: e.rotation ?? 0 };
        if (type === 'text') {
          base.scaleX = base.scaleX ?? 1;
          base.scaleY = base.scaleY ?? 1;
          base.letterSpacing = base.letterSpacing ?? 0;
          base.lineHeight = base.lineHeight ?? 1.2;
          base.padding = base.padding ?? 0;
          base.strokeWidth = base.strokeWidth ?? 0;
        }
        return base;
      });
    };

    if (data.textElements) this.textElements.set(processElements(data.textElements, 'text'));
    if (data.imageElements) this.imageElements.set(processElements(data.imageElements, 'image'));
    if (data.shapeElements) this.shapeElements.set(processElements(data.shapeElements, 'shape'));
    
    if (data.groups) this.groups.set(data.groups);
    if (data.canvasWidth) this.canvasWidth.set(data.canvasWidth);
    if (data.canvasHeight) this.canvasHeight.set(data.canvasHeight);
    
    this.deselectAll(); // Deselect to avoid selection bound issues across undo/redo or import
  }
}
