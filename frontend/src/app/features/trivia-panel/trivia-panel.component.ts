import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TriviaQuestion } from '../../core/models/question.model';

@Component({
  selector: 'app-trivia-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trivia-panel.component.html',
  styleUrls: ['./trivia-panel.component.css']
})
export class TriviaPanelComponent {
  /**
   * Pregunta inyectada por el contenedor padre o servicio WebSocket (Regla R4)
   */
  @Input() question: TriviaQuestion | null = null;

  /**
   * Indicador si estamos esperando respuesta del backend o la siguiente ronda
   */
  @Input() isWaiting: boolean = false;

  /**
   * Indicador de si la pregunta activa proviene de la cajita "?"
   */
  @Input() isBoxQuestion: boolean = false;

  /**
   * Resultado de la última respuesta enviada para dar feedback visual inmediato
   */
  @Input() lastResult: { isCorrect: boolean; peGainedOrLost: number; racha: number } | null = null;

  /**
   * Emite la opción elegida por el jugador al hacer clic en "ENVIAR - RESPONDER"
   * La validación de si es correcta o no la realiza EXCLUSIVAMENTE el backend (Regla R6)
   */
  @Output() answerSubmitted = new EventEmitter<'A' | 'B' | 'C' | 'D'>();

  // Selección actual del jugador en el cliente
  selectedOption: 'A' | 'B' | 'C' | 'D' | null = null;

  /**
   * Permite al jugador seleccionar una opción antes de enviar
   */
  selectOption(optionId: 'A' | 'B' | 'C' | 'D'): void {
    if (this.isWaiting) return;
    this.selectedOption = optionId;
  }

  /**
   * Envía la respuesta seleccionada hacia el backend
   */
  submitAnswer(): void {
    if (!this.selectedOption || this.isWaiting) return;
    this.answerSubmitted.emit(this.selectedOption);
    // Reiniciamos selección tras emitir
    this.selectedOption = null;
  }
}
