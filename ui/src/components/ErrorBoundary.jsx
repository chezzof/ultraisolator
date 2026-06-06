import { Component } from 'react';
import { Content, Tile } from '@carbon/react';
import { useI18n } from '../i18n.jsx';

class ErrorBoundaryFrame extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const copy = this.props.copy || {};

    return (
      <Content className="main-content">
        <section className="page" aria-labelledby="error-boundary-title">
          <Tile className="module-surface">
            <div className="module-title" id="error-boundary-title">{copy.title || 'Something went wrong'}</div>
            <div className="module-empty">{copy.detail || 'Reload the dashboard to reconnect to the local API.'}</div>
            <div className="settings-actions">
              <button type="button" onClick={() => window.location.reload()}>
                {copy.reload || 'Reload'}
              </button>
            </div>
          </Tile>
        </section>
      </Content>
    );
  }
}

export function ErrorBoundary({ children }) {
  const { t } = useI18n();
  const copy = {
    title: t('errorBoundary.title', 'Something went wrong'),
    detail: t('errorBoundary.detail', 'Reload the dashboard to reconnect to the local API.'),
    reload: t('common.reload', 'Reload')
  };

  return <ErrorBoundaryFrame copy={copy}>{children}</ErrorBoundaryFrame>;
}
