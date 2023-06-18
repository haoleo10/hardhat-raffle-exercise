const { network, ethers } = require("hardhat")
const { verify } = require("../utils/verify")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const FUND_AMOUNT = ethers.utils.parseEther("1")
module.exports = async (hre) => {
    const { getNamedAccounts, deployments } = hre
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, vrfCoodrinatorV2Mock, subscriptionId

    if (chainId == 31337) {
        //creat VRFV2 subscription
        vrfCoodrinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoodrinatorV2Mock.address
        const txResponse = await vrfCoodrinatorV2Mock.createSubscription()
        const txReceipt = await txResponse.wait()
        subscriptionId = txReceipt.events[0].args.subId
        //error：给模拟账户提供资金，否则无法执行fulfillRandomWords
        await vrfCoodrinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    } else {
        //vrf网站上的VRF Coordinator地址
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("---------------------------------------lli")
    const args = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId]["gasLane"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["raffleEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitBlockConfirmations: waitBlockConfirmations,
    })
    // Ensure the Raffle contract is a valid consumer of the VRFCoordinatorV2Mock contract.
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract(
            "VRFCoordinatorV2Mock"
        )
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }
    log("部署完成")

    // Verify the deployment
    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log("验证中...")
        await verify(raffle.address, args)
    }

}
module.exports.tags = ["all", "raffle"]
