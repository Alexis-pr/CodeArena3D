import { Injectable, OnDestroy } from '@angular/core';

export interface MovementVector {
  x: number; // Eje horizontal (-1 izquierda / Oeste, +1 derecha / Este)
  z: number; // Eje vertical (-1 arriba / Norte, +1 abajo / Sur)
  isMoving: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class InputService implements OnDestroy {
  // Teclas activas
  private keysPressed: Set<string> = new Set();

  private keydownListener = (event: KeyboardEvent) => this.handleKeyDown(event);
  private keyupListener = (event: KeyboardEvent) => this.handleKeyUp(event);

  constructor() {
    window.addEventListener('keydown', this.keydownListener);
    window.addEventListener('keyup', this.keyupListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.keydownListener);
    window.removeEventListener('keyup', this.keyupListener);
    this.keysPressed.clear();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Evitar que las teclas de flecha hagan scroll en la página
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    this.keysPressed.add(event.code.toLowerCase());
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keysPressed.delete(event.code.toLowerCase());
  }

  /**
   * Retorna el vector de movimiento normalizado combinando WASD y Flechas direccionales
   */
  getMovementVector(): MovementVector {
    let dx = 0;
    let dz = 0;

    // Movimiento hacia arriba / Norte (-Z en Three.js)
    if (this.keysPressed.has('keyw') || this.keysPressed.has('arrowup')) {
      dz -= 1;
    }
    // Movimiento hacia abajo / Sur (+Z en Three.js)
    if (this.keysPressed.has('keys') || this.keysPressed.has('arrowdown')) {
      dz += 1;
    }
    // Movimiento hacia la izquierda / Oeste (-X en Three.js)
    if (this.keysPressed.has('keya') || this.keysPressed.has('arrowleft')) {
      dx -= 1;
    }
    // Movimiento hacia la derecha / Este (+X en Three.js)
    if (this.keysPressed.has('keyd') || this.keysPressed.has('arrowright')) {
      dx += 1;
    }

    const length = Math.hypot(dx, dz);
    if (length > 0) {
      return {
        x: dx / length,
        z: dz / length,
        isMoving: true
      };
    }

    return { x: 0, z: 0, isMoving: false };
  }

  /**
   * Limpia el estado de teclas (útil si la ventana pierde el foco)
   */
  reset(): void {
    this.keysPressed.clear();
  }
}
