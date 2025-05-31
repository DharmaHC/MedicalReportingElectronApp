import { Window } from '@progress/kendo-react-dialogs';

// --- IMPOSTAZIONI AREA STAMPABILE E MARGINI ---
const PRINTABLE_WIDTH = 600;  // px (86 caratteri * 8.5px)
const PRINTABLE_HEIGHT = 460; // px (28 righe * 16.4px)
const MARGIN_X = 40;          // px margini laterali
const MARGIN_Y = 45;          // px margini sopra/sotto

const BASE_WIDTH = PRINTABLE_WIDTH + MARGIN_X * 2;    // 680px
const BASE_HEIGHT = PRINTABLE_HEIGHT + MARGIN_Y * 2;  // 550px

type Props = {
  htmlContent: string;
  onClose: () => void;
  scale?: number;
};

const PreviewA4Window: React.FC<Props> = ({
  htmlContent,
  onClose,
  scale = 0.27 // di default media
}) => {
  // Calcola le dimensioni della finestra **ridotte secondo la scala**
  const winWidth = Math.round(BASE_WIDTH * scale) + 32;  // padding finestra
  const winHeight = Math.round(BASE_HEIGHT * scale) + 60; // padding finestra

  // foglio "virtuale" sempre in scala 1:1 e scalato via transform
  return (
    <Window
      width={winWidth}
      height={winHeight}
      minWidth={winWidth}
      minHeight={winHeight}
      resizable={true}
      draggable
      className="preview-window-no-bar"
      title=""
      onClose={onClose}
    >
      <div
        style={{
          width: BASE_WIDTH * scale,
          height: BASE_HEIGHT * scale,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: "#eee",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            background: "#fff",
            border: "2px solid #bbb",
            margin: "0 auto",
            boxShadow: "0 0 6px #bbb",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
            position: "relative"
          }}
        >
          {/* Area stampabile */}
          <div
            style={{
              width: PRINTABLE_WIDTH,
              height: PRINTABLE_HEIGHT,
              margin: `${MARGIN_Y}px ${MARGIN_X}px`,
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: 16,
              lineHeight: 1.1,
              background: "#fff",
              color: "#222",
              overflow: "hidden"
            }}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      </div>
    </Window>
  );
};

export default PreviewA4Window;
