import * as React from "react";
import InstanceTable from "../views/InstanceTable";
import Loader from "../views/Loader";
import Pager from "../views/Pager";

import "../../assets/scss/components/Run.scss";

class Run extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      instances: [],
      isLoading: true,
      currentPage: 0,
      pageSize: 20,
      totalCount: 0,
      addons: {},
    }
  }

  componentDidMount() {
    this.loadRunInstances();
  }

  onGotoPage = (page, event) => {
    event.preventDefault();
    this.setState({ currentPage: page });
    this.loadRunInstances(page, this.state.pageSize);
  }

  loadRunInstances = async (currentPage = 0, pageSize = 20) => {
    try {
      this.setState({ isLoading: true });

      const res = await fetch(`${window.env.API_ENDPOINT}/run/${this.props.match.params.runId}`, {
        method: "POST",
        body: JSON.stringify({
          currentPage,
          pageSize,
          addons: this.state.addons,
        })
      });
  
      const resJson = await res.json();
  
      this.setState({
        instances: resJson.instances,
        totalCount: resJson.total,
        addons: this.getAddonsMap(resJson.addons),
        isLoading: false,
      })

      return true;
    } catch(err) {
      console.error(err);
      this.setState({ isLoading: false });
      return false;
    }
  }

  getAddonsMap = addonsArr => {
    if (!addonsArr) {
      return {};
    }

    addonsArr.sort();

    const addons = {};
    for (let i = 0; i < addonsArr.length; i++) {
      const addon = addonsArr[i];
      addons[addon] = this.state.addons[addon];
    };

    return addons;
  }

  setAddonVersion = (addon, version) => {
    const addons = { ...this.state.addons };
    addons[addon] = version;
    this.setState({ addons });
  }

  searchAddons = async () => {
    const success = await this.loadRunInstances();
    if (success) {
      this.setState({ currentPage: 0 });
    }
  }

  render() {
    if (this.state.isLoading) {
      return (
        <div style={{ marginTop: 24 }}>
          <Loader />
        </div>
      );
    }

    return (
      <div className="RunContainer">
        <p className="title">kURL Test Run: {`${this.props.match.params.runId}`}</p>
        
        {/* Addons search */}
        <div className="u-width--threeQuarters u-marginBottom--20 u-borderAll--gray u-padding--row">
          <div className="flex flexWrap--wrap u-marginBottom--10" >
            {this.state.addons && Object.keys(this.state.addons).map(addon => (
              <div key={addon} className="flex u-marginBottom--10 alignItems--center u-width--fourth">
                <span className="flex1 u-marginRight--10">{addon}</span>
                <input
                  className="Input flex2 u-marginRight--20"
                  type="text"
                  placeholder="Version"
                  value={this.state.addons[addon]}
                  onChange={e => this.setAddonVersion(addon, e.target.value)}
                />
              </div>
            ))}
          </div>
          <button type="button" className="btn primary" onClick={this.searchAddons}>Search</button>
        </div>

        <InstanceTable
          instances={this.state.instances} 
        />

        <Pager
          pagerType="instances"
          currentPage={parseInt(this.state.currentPage) || 0}
          pageSize={this.state.pageSize}
          totalCount={this.state.totalCount}
          loading={false}
          currentPageLength={this.state.instances.length}
          goToPage={this.onGotoPage}
        />
      </div>
    );
  }
}

export default Run;
