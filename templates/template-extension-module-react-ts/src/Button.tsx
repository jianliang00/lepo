import './Button.css';

interface ButtonProps {
  backgroundColor?: string;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  size?: 'large' | 'medium' | 'small';
}

export const Button = ({
  backgroundColor,
  label,
  primary = false,
  size = 'medium',
  ...props
}: ButtonProps) => {
  const mode = primary ? 'demo-button--primary' : 'demo-button--secondary';
  return (
      <button
          bindclickevent={props.onClick}
          className={['demo-button', `demo-button--${size}`, mode].join(' ')}
          style={{ backgroundColor }}
          text={label}
      />
  );
};
